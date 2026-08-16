import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';
import { computeCommissionSplit, persistCommissions, cancelCommissionsForAppointment, CommissionOverAllocationError } from '@/lib/services/commissions';
import { dispatchNotificationAsync } from '@/lib/services/notifications';
import type { PaymentMethod, PaymentStatus } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';

export class PaymentNotFoundError extends Error {}
export class PaymentGatewayError extends Error {}
export class InvalidPaymentStateError extends Error {}
export class AppointmentNotPayableError extends Error {}

const PAYMENT_INCLUDE = {
  transactions: { orderBy: { createdAt: 'asc' } },
  appointment: { select: { id: true, scheduledAt: true, status: true } },
} as const;

const TERMINAL_STATUSES: PaymentStatus[] = ['PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];

async function recordTransaction(paymentId: string, type: string, amountMinor: number, status: PaymentStatus) {
  await db.transaction.create({ data: { paymentId, type, amountMinor, status } });
}

async function notifyDoctorPatient(appointmentId: string, event: 'PAYMENT_COMPLETED' | 'PAYMENT_REFUNDED', amountMinor: number, currency: string) {
  const full = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { include: { user: { select: { id: true } } } }, doctor: { include: { user: { select: { name: true } } } } },
  });
  if (!full) return;
  dispatchNotificationAsync({
    event,
    userId: full.patient.user.id,
    tenantId: full.tenantId,
    vars: { doctorName: full.doctor.user.name, amount: `${(amountMinor / 100).toFixed(2)} ${currency}` },
  });
}

/**
 * Persists the commission split for a just-captured payment. Recomputes rather than reusing
 * whatever was validated at collection time — for the synchronous path these happen
 * milliseconds apart so it's the same answer; for a redirect-confirmed payment (see
 * finalizeRedirectPayment) the two can be minutes apart, and a fresh computation is more
 * correct than a stale one. If commission config was broken in that gap, the money is
 * already real (a redirect gateway has already settled it) — refusing to record the
 * payment would just hide a captured payment with no ledger row, which is worse than an
 * audited, un-split payment an operator can reconcile manually.
 */
async function settleCommissions(appointmentId: string, actor: SessionUser | null) {
  try {
    const split = await computeCommissionSplit(appointmentId);
    if (split) await persistCommissions(appointmentId, split, actor);
  } catch (err) {
    if (err instanceof CommissionOverAllocationError) {
      await recordAudit({
        actorUserId: actor?.id ?? null,
        action: 'COMMISSION_MISCONFIGURED_AT_SETTLEMENT',
        entityType: 'Appointment',
        entityId: appointmentId,
        afterState: { message: err.message },
      });
      return;
    }
    throw err;
  }
}

/**
 * Collect payment for an appointment. For cash/insurance/bank transfer/corporate billing
 * (and the dev adapter) this still authorizes and captures in one synchronous call — that
 * matches how a clinic front desk actually takes money. A real card gateway (PayTabs) is
 * redirect-based: `authorize()` returns `pending: true` with a `redirectUrl` instead of an
 * immediate result, the payment is parked in AWAITING_REDIRECT, and settlement completes
 * later via finalizeRedirectPayment (webhook or return-page confirmation) — never here.
 *
 * Commissions are generated on successful capture, not at booking time: the split should
 * only exist once the money is real.
 */
export async function collectAppointmentPayment(
  appointmentId: string,
  input: { method: PaymentMethod; amountMinor?: number },
  actor: SessionUser
) {
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId },
    include: { patient: { include: { user: { select: { name: true, email: true, phone: true } } } }, branch: { include: { city: { include: { country: true } } } } },
  });
  if (!appointment) throw new PaymentNotFoundError('No appointment with that id.');

  if (['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(appointment.status)) {
    throw new AppointmentNotPayableError(`Cannot take payment for an appointment with status ${appointment.status}.`);
  }

  const existing = await db.payment.findFirst({
    where: { appointmentId, status: { in: ['PAID', 'AUTHORIZED', 'AWAITING_REDIRECT'] } },
  });
  if (existing) throw new InvalidPaymentStateError('This appointment already has a payment.');

  const amountMinor = input.amountMinor ?? appointment.priceMinor;

  // Validate the commission configuration BEFORE contacting the gateway. If the
  // configured rules can't produce a valid split, refuse the payment outright rather than
  // capturing money we can't correctly account for — a captured payment with no
  // commission split is an accounting hole, not a recoverable warning.
  const split = await computeCommissionSplit(appointmentId);

  const provider = getPaymentProvider();

  const payment = await db.payment.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId,
      patientId: appointment.patientId,
      amountMinor,
      currency: appointment.currency,
      method: input.method,
      provider: provider.id,
      status: 'PENDING',
    },
  });

  const authorized = await provider.authorize({
    amountMinor,
    currency: appointment.currency,
    method: input.method,
    // Reference is opaque and non-clinical on purpose — never leak medical context to a gateway.
    reference: `appointment:${appointmentId}`,
    paymentId: payment.id,
    customer: {
      name: appointment.patient.user.name,
      email: appointment.patient.user.email,
      phone: appointment.patient.user.phone ?? undefined,
      street: appointment.branch?.address,
      city: appointment.branch?.city.name,
      country: appointment.branch?.city.country.code,
    },
  });

  if (!authorized.success) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    await recordTransaction(payment.id, 'AUTHORIZE', amountMinor, 'FAILED');
    throw new PaymentGatewayError(authorized.failureReason ?? 'Authorization failed.');
  }

  if (authorized.pending) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'AWAITING_REDIRECT', providerRef: authorized.providerRef },
    });
    await recordTransaction(payment.id, 'AUTHORIZE', amountMinor, 'AWAITING_REDIRECT');
    const awaiting = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
    return { payment: awaiting, redirectUrl: authorized.redirectUrl };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'AUTHORIZED', providerRef: authorized.providerRef },
  });
  await recordTransaction(payment.id, 'AUTHORIZE', amountMinor, 'AUTHORIZED');

  const captured = await provider.capture(authorized.providerRef, amountMinor);
  if (!captured.success) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    await recordTransaction(payment.id, 'CAPTURE', amountMinor, 'FAILED');
    throw new PaymentGatewayError(captured.failureReason ?? 'Capture failed.');
  }

  await db.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
  await recordTransaction(payment.id, 'CAPTURE', amountMinor, 'PAID');
  // Re-read after the capture row exists so the response carries the complete ledger.
  const paid = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: appointment.tenantId,
    action: 'PAYMENT_CAPTURED',
    entityType: 'Payment',
    entityId: payment.id,
    afterState: { amountMinor, method: input.method, provider: provider.id },
  });

  if (split) await persistCommissions(appointmentId, split, actor);

  if (paid.appointment) await notifyDoctorPatient(appointmentId, 'PAYMENT_COMPLETED', amountMinor, appointment.currency);

  return { payment: paid };
}

/**
 * Confirms a redirect-based payment's real outcome by asking the gateway directly
 * (`provider.queryStatus`) rather than trusting a webhook payload or a browser redirect's
 * query string — either could be replayed, delayed, or (for the browser redirect) forged
 * by the payer, since it's just a URL they control. Both the PayTabs IPN callback route and
 * the tenant-facing "return from payment" confirmation route call this same function, so
 * whichever arrives first settles the payment and the other is a no-op.
 *
 * Idempotent: a payment already in a terminal state is returned as-is rather than
 * re-queried or re-settled — this is what makes it safe for both the webhook and the
 * return-page confirm call to race.
 *
 * Takes our own Payment id, not the gateway's providerRef: the gateway's own transaction
 * reference is untrusted input on the browser-return path (it comes back on a URL the payer
 * controls), and every real gateway call this function makes uses payment.providerRef read
 * fresh from our own row, never anything supplied by the caller.
 */
export async function finalizeRedirectPayment(paymentId: string, actor: SessionUser | null) {
  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) throw new PaymentNotFoundError('No payment with that id.');

  if (TERMINAL_STATUSES.includes(payment.status)) {
    return db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
  }
  if (payment.status !== 'AWAITING_REDIRECT') {
    throw new InvalidPaymentStateError(`Cannot finalize a payment with status ${payment.status}.`);
  }
  if (!payment.providerRef) throw new PaymentGatewayError('Payment has no provider reference to confirm.');

  const provider = getPaymentProvider();
  if (!provider.queryStatus) {
    throw new PaymentGatewayError('The configured payment provider does not support status queries.');
  }

  const result = await provider.queryStatus(payment.providerRef);

  if (!result.success) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    await recordTransaction(payment.id, 'CAPTURE', payment.amountMinor, 'FAILED');
    await recordAudit({
      actorUserId: actor?.id ?? null,
      tenantId: payment.tenantId,
      action: 'PAYMENT_REDIRECT_FAILED',
      entityType: 'Payment',
      entityId: payment.id,
      afterState: { failureReason: result.failureReason },
    });
    return db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
  }

  await db.payment.update({ where: { id: payment.id }, data: { status: 'AUTHORIZED' } });
  await recordTransaction(payment.id, 'CAPTURE', payment.amountMinor, 'AUTHORIZED');

  await provider.capture(payment.providerRef, payment.amountMinor);

  await db.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
  await recordTransaction(payment.id, 'CAPTURE', payment.amountMinor, 'PAID');
  const paid = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });

  await recordAudit({
    actorUserId: actor?.id ?? null,
    tenantId: payment.tenantId,
    action: 'PAYMENT_CAPTURED',
    entityType: 'Payment',
    entityId: payment.id,
    afterState: { amountMinor: payment.amountMinor, method: payment.method, provider: payment.provider, viaRedirect: true },
  });

  if (payment.appointmentId) {
    await settleCommissions(payment.appointmentId, actor);
    await notifyDoctorPatient(payment.appointmentId, 'PAYMENT_COMPLETED', payment.amountMinor, payment.currency);
  }

  return paid;
}

/**
 * Releases a payment stuck in AWAITING_REDIRECT — the payer closed the hosted page, or
 * never returned — so the front desk isn't permanently blocked from re-attempting
 * collection on that appointment (the duplicate-payment guard in collectAppointmentPayment
 * blocks a second attempt while one is AWAITING_REDIRECT).
 */
export async function cancelAwaitingPayment(paymentId: string, actor: SessionUser) {
  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) throw new PaymentNotFoundError('No payment with that id.');
  if (payment.status !== 'AWAITING_REDIRECT') {
    throw new InvalidPaymentStateError(`Cannot cancel a payment with status ${payment.status}.`);
  }

  const provider = getPaymentProvider();
  if (payment.providerRef) {
    await provider.void(payment.providerRef, payment.amountMinor, payment.currency);
  }

  await db.payment.update({ where: { id: paymentId }, data: { status: 'CANCELLED' } });
  await recordTransaction(paymentId, 'VOID', payment.amountMinor, 'CANCELLED');
  await recordAudit({
    actorUserId: actor.id,
    tenantId: payment.tenantId,
    action: 'PAYMENT_REDIRECT_CANCELLED',
    entityType: 'Payment',
    entityId: paymentId,
  });

  return db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: PAYMENT_INCLUDE });
}

export async function refundPayment(paymentId: string, amountMinor: number | undefined, actor: SessionUser) {
  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) throw new PaymentNotFoundError('No payment with that id.');
  if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new InvalidPaymentStateError(`Cannot refund a payment with status ${payment.status}.`);
  }

  const alreadyRefunded = await db.transaction.aggregate({
    where: { paymentId, type: { in: ['REFUND', 'PARTIAL_REFUND'] }, status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } },
    _sum: { amountMinor: true },
  });
  const refundedSoFar = alreadyRefunded._sum.amountMinor ?? 0;
  const remaining = payment.amountMinor - refundedSoFar;
  const refundAmount = amountMinor ?? remaining;

  if (refundAmount <= 0 || refundAmount > remaining) {
    throw new InvalidPaymentStateError(`Refund amount must be between 1 and ${remaining}.`);
  }

  const provider = getPaymentProvider();
  const result = await provider.refund(payment.providerRef ?? '', refundAmount);
  if (!result.success) throw new PaymentGatewayError(result.failureReason ?? 'Refund failed.');

  const isFull = refundAmount === remaining;
  const nextStatus: PaymentStatus = isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await db.payment.update({ where: { id: paymentId }, data: { status: nextStatus } });
  await recordTransaction(paymentId, isFull ? 'REFUND' : 'PARTIAL_REFUND', refundAmount, nextStatus);
  const updated = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: PAYMENT_INCLUDE });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: payment.tenantId,
    action: 'PAYMENT_REFUNDED',
    entityType: 'Payment',
    entityId: paymentId,
    beforeState: { status: payment.status },
    afterState: { status: nextStatus, refundAmountMinor: refundAmount },
  });

  // A fully refunded booking must not leave payable commissions behind. A partial refund
  // deliberately leaves them: the clinic still earned something and the correct partial
  // recalculation is a finance-policy decision, not something to guess at here.
  if (isFull && payment.appointmentId) {
    await cancelCommissionsForAppointment(payment.appointmentId, actor);
  }

  if (payment.appointmentId) await notifyDoctorPatient(payment.appointmentId, 'PAYMENT_REFUNDED', refundAmount, payment.currency);

  return updated;
}

export async function listTenantPayments(filters: { appointmentId?: string } = {}) {
  return db.payment.findMany({
    where: { ...(filters.appointmentId ? { appointmentId: filters.appointmentId } : {}) },
    include: PAYMENT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getAppointmentPayment(appointmentId: string) {
  return db.payment.findFirst({ where: { appointmentId }, include: PAYMENT_INCLUDE, orderBy: { createdAt: 'desc' } });
}

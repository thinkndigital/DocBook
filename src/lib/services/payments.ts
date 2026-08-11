import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/payments';
import { computeCommissionSplit, persistCommissions, cancelCommissionsForAppointment } from '@/lib/services/commissions';
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

async function recordTransaction(paymentId: string, type: string, amountMinor: number, status: PaymentStatus) {
  await db.transaction.create({ data: { paymentId, type, amountMinor, status } });
}

/**
 * Collect payment for an appointment. Authorizes and captures in one call — that matches
 * how a clinic front desk actually takes money (cash/card at the counter). The provider
 * interface keeps the two steps distinct so a gateway that authorizes at booking and
 * captures at check-in can be added later without reshaping this service.
 *
 * Commissions are generated on successful capture, not at booking time: the split should
 * only exist once the money is real.
 */
export async function collectAppointmentPayment(
  appointmentId: string,
  input: { method: PaymentMethod; amountMinor?: number },
  actor: SessionUser
) {
  const appointment = await db.appointment.findFirst({ where: { id: appointmentId } });
  if (!appointment) throw new PaymentNotFoundError('No appointment with that id.');

  if (['CANCELLED', 'NO_SHOW', 'RESCHEDULED'].includes(appointment.status)) {
    throw new AppointmentNotPayableError(`Cannot take payment for an appointment with status ${appointment.status}.`);
  }

  const existing = await db.payment.findFirst({
    where: { appointmentId, status: { in: ['PAID', 'AUTHORIZED'] } },
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
  });

  if (!authorized.success) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    await recordTransaction(payment.id, 'AUTHORIZE', amountMinor, 'FAILED');
    throw new PaymentGatewayError(authorized.failureReason ?? 'Authorization failed.');
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

  return paid;
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

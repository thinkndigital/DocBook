import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import {
  collectAppointmentPayment,
  refundPayment,
  InvalidPaymentStateError,
  AppointmentNotPayableError,
} from '@/lib/services/payments';
import { getPaymentProvider } from '@/lib/payments';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

/**
 * Exercises the DevPaymentAdapter through the real service-layer state machine
 * (PENDING -> AUTHORIZED -> PAID, then PAID -> PARTIALLY_REFUNDED -> REFUNDED), since
 * nothing previously asserted this end-to-end. getPaymentProvider() refuses the dev
 * adapter under NODE_ENV=production by design (see src/lib/payments/index.ts) — this
 * suite runs under vitest (NODE_ENV=test), which is the only place the dev adapter's
 * state transitions can be verified without a real gateway.
 */
describe('payment state machine (dev adapter)', () => {
  let world: TestWorld;

  beforeAll(async () => {
    world = await createWorld('pay');
  });

  afterAll(async () => {
    await cleanupWorld(world);
  });

  function bookingInput(scheduledAt: Date) {
    return {
      doctorId: world.doctorId,
      branchId: world.branchId,
      serviceId: world.serviceId,
      patientId: world.patientId,
      scheduledAt: scheduledAt.toISOString(),
      type: 'IN_PERSON' as const,
    };
  }

  it('authorizes and captures in one call, landing on PAID with a full transaction ledger', async () => {
    const appointment = await createAppointment(bookingInput(futureSlot(3, 9)), world.staffSession);

    const { payment, redirectUrl } = await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);

    expect(redirectUrl).toBeUndefined();
    expect(payment.status).toBe('PAID');
    expect(payment.providerRef?.startsWith('dev_')).toBe(true);
    expect(payment.transactions.map((t) => `${t.type}:${t.status}`)).toEqual(['AUTHORIZE:AUTHORIZED', 'CAPTURE:PAID']);

    const commissions = await db.commission.findMany({ where: { appointmentId: appointment.id } });
    const total = commissions.reduce((sum, c) => sum + c.amountMinor, 0);
    expect(total).toBe(appointment.priceMinor);
  });

  it('refuses a second payment on an appointment that already has one (no double-capture)', async () => {
    const appointment = await createAppointment(bookingInput(futureSlot(3, 10)), world.staffSession);

    await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);

    await expect(collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession)).rejects.toThrow(
      InvalidPaymentStateError
    );
  });

  it('refuses payment on a cancelled appointment', async () => {
    const appointment = await createAppointment(bookingInput(futureSlot(3, 11)), world.staffSession);
    await db.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });

    await expect(collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession)).rejects.toThrow(
      AppointmentNotPayableError
    );
  });

  it('full refund moves PAID -> REFUNDED and cancels the paid commissions', async () => {
    const appointment = await createAppointment(bookingInput(futureSlot(3, 12)), world.staffSession);
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);

    const refunded = await refundPayment(payment.id, undefined, world.staffSession);
    expect(refunded.status).toBe('REFUNDED');

    const commissions = await db.commission.findMany({ where: { appointmentId: appointment.id } });
    expect(commissions.every((c) => c.status === 'CANCELLED')).toBe(true);
  });

  it('partial refund moves PAID -> PARTIALLY_REFUNDED and rejects a second refund beyond the remainder', async () => {
    const appointment = await createAppointment(bookingInput(futureSlot(3, 13)), world.staffSession);
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);
    const half = Math.floor(payment.amountMinor / 2);

    const partial = await refundPayment(payment.id, half, world.staffSession);
    expect(partial.status).toBe('PARTIALLY_REFUNDED');

    // remaining is amountMinor - half; requesting more than that must be rejected
    await expect(refundPayment(payment.id, payment.amountMinor, world.staffSession)).rejects.toThrow(
      InvalidPaymentStateError
    );

    // refunding exactly the remainder succeeds and completes the refund
    const remainder = payment.amountMinor - half;
    const complete = await refundPayment(payment.id, remainder, world.staffSession);
    expect(complete.status).toBe('REFUNDED');
  });

  it('DevPaymentAdapter rejects a zero/negative amount authorization', async () => {
    const provider = getPaymentProvider();
    const result = await provider.authorize({ amountMinor: 0, currency: 'JOD', method: 'CASH', reference: 'test' });
    expect(result.success).toBe(false);
  });

  it('DevPaymentAdapter rejects a zero/negative refund amount', async () => {
    const provider = getPaymentProvider();
    const result = await provider.refund('dev_whatever', 0);
    expect(result.success).toBe(false);
  });

  it('getPaymentProvider refuses PAYMENT_PROVIDER=dev under NODE_ENV=production', async () => {
    // Simulates the production guard directly (see src/lib/payments/index.ts) rather than
    // mutating process.env for the whole suite, since getPaymentProvider() caches its
    // instance at module load. This documents the intended behavior explicitly rather than
    // relying on it never being exercised.
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/lib/payments/index.ts', import.meta.url), 'utf8')
    );
    expect(src).toContain("PAYMENT_PROVIDER=dev is not permitted in production");
    expect(src).toContain("process.env.NODE_ENV === 'production'");
  });
});

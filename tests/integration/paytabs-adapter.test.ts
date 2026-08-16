import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import {
  collectAppointmentPayment,
  finalizeRedirectPayment,
  cancelAwaitingPayment,
  InvalidPaymentStateError,
} from '@/lib/services/payments';
import { PayTabsAdapter, verifyPaytabsSignature } from '@/lib/payments/paytabs-adapter';
import { __setPaymentProviderForTests } from '@/lib/payments';
import { MockPayTabsServer } from './paytabs-mock-server';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

/**
 * Verifies PayTabsAdapter and the redirect-payment flow it enables against a local mock
 * server that replicates PayTabs' real contract (see paytabs-mock-server.ts) — not against
 * a real PayTabs account, which doesn't exist for this project (see the adapter's own doc
 * comment).
 *
 * Deliberately never touches process.env for provider selection — integration test files
 * can share an OS-level worker/fork process for performance, and process.env is a single
 * mutable object for that whole process, so PAYMENT_PROVIDER set here was observed leaking
 * into payments.test.ts's dev-adapter assumptions when both ran in the same worker,
 * regardless of Vitest's fileParallelism/pool settings. __setPaymentProviderForTests
 * injects the adapter directly into this module's own `cached` variable instead, which
 * Vitest's per-file module isolation does keep genuinely separate.
 */

const SERVER_KEY = 'test-server-key';
const PROFILE_ID = '99999';
let mock: MockPayTabsServer;

function freshAdapter() {
  return new PayTabsAdapter(
    PROFILE_ID,
    SERVER_KEY,
    mock.baseUrl,
    'http://localhost:3000/api/v1/payments/paytabs/callback',
    'http://localhost:3000/tenant/payments/return'
  );
}

beforeAll(async () => {
  mock = new MockPayTabsServer(SERVER_KEY);
  await mock.start();
  __setPaymentProviderForTests(freshAdapter());
});

afterAll(async () => {
  __setPaymentProviderForTests(undefined);
  await mock.stop();
});

beforeEach(() => {
  mock.resetForTest();
});

describe('PayTabsAdapter (unit, against a local mock server)', () => {
  it('routes CARD through the gateway and returns pending + a redirectUrl', async () => {
    mock.setNextOutcome('A');
    const result = await freshAdapter().authorize({
      amountMinor: 5000,
      currency: 'JOD',
      method: 'CARD',
      reference: 'x',
      paymentId: randomUUID(),
    });
    expect(result.success).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.redirectUrl).toContain(mock.baseUrl);
    expect(result.providerRef).toMatch(/^MOCK_/);
  });

  it('records CASH as an immediate manual success without ever contacting the gateway', async () => {
    const result = await freshAdapter().authorize({ amountMinor: 5000, currency: 'JOD', method: 'CASH', reference: 'x' });
    expect(result.success).toBe(true);
    expect(result.pending).toBeUndefined();
    expect(result.providerRef).toMatch(/^manual_/);
    expect(mock.requestCount).toBe(0);
  });

  it('rejects a zero/negative amount before contacting the gateway', async () => {
    const result = await freshAdapter().authorize({
      amountMinor: 0,
      currency: 'JOD',
      method: 'CARD',
      reference: 'x',
      paymentId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it('fails cleanly for CARD when the internal payment id is missing', async () => {
    const result = await freshAdapter().authorize({ amountMinor: 5000, currency: 'JOD', method: 'CARD', reference: 'x' });
    expect(result.success).toBe(false);
  });

  it('queryStatus reflects the outcome recorded at sale time — success', async () => {
    mock.setNextOutcome('A');
    const sale = await freshAdapter().authorize({
      amountMinor: 5000,
      currency: 'JOD',
      method: 'CARD',
      reference: 'x',
      paymentId: randomUUID(),
    });
    const ok = await freshAdapter().queryStatus(sale.providerRef);
    expect(ok.success).toBe(true);
  });

  it('queryStatus reflects the outcome recorded at sale time — declined', async () => {
    mock.setNextOutcome('D');
    const sale = await freshAdapter().authorize({
      amountMinor: 5000,
      currency: 'JOD',
      method: 'CARD',
      reference: 'x',
      paymentId: randomUUID(),
    });
    const declined = await freshAdapter().queryStatus(sale.providerRef);
    expect(declined.success).toBe(false);
  });

  it('refunds a real gateway transaction reference', async () => {
    mock.setNextOutcome('A');
    const sale = await freshAdapter().authorize({
      amountMinor: 5000,
      currency: 'JOD',
      method: 'CARD',
      reference: 'x',
      paymentId: randomUUID(),
    });
    const refunded = await freshAdapter().refund(sale.providerRef, 5000);
    expect(refunded.success).toBe(true);
  });

  it('refund/void are a no-op success for manual (non-gateway) payments', async () => {
    const voided = await freshAdapter().void('manual_abc', 5000, 'JOD');
    const refunded = await freshAdapter().refund('manual_abc', 5000);
    expect(voided.success).toBe(true);
    expect(refunded.success).toBe(true);
  });
});

describe('PayTabs IPN signature verification', () => {
  it('accepts a correctly signed payload', () => {
    const raw = JSON.stringify({ cart_id: 'x' });
    expect(verifyPaytabsSignature(raw, mock.sign(raw), SERVER_KEY)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const raw = JSON.stringify({ cart_id: 'x' });
    const sig = mock.sign(raw);
    expect(verifyPaytabsSignature(raw + 'tampered', sig, SERVER_KEY)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyPaytabsSignature('{}', null, SERVER_KEY)).toBe(false);
  });

  it('rejects a signature computed with the wrong key', () => {
    const raw = JSON.stringify({ cart_id: 'x' });
    const wrongSig = createHmac('sha256', 'wrong-key').update(raw, 'utf8').digest('hex');
    expect(verifyPaytabsSignature(raw, wrongSig, SERVER_KEY)).toBe(false);
  });
});

describe('redirect payment flow end-to-end (collectAppointmentPayment -> finalizeRedirectPayment)', () => {
  let world: TestWorld;

  beforeAll(async () => {
    world = await createWorld('ptmock');
  });

  afterAll(async () => {
    await cleanupWorld(world);
  });

  function bookingInput(hourUtc: number) {
    return {
      doctorId: world.doctorId,
      branchId: world.branchId,
      serviceId: world.serviceId,
      patientId: world.patientId,
      scheduledAt: futureSlot(3, hourUtc).toISOString(),
      type: 'IN_PERSON' as const,
    };
  }

  it('CARD collection parks the payment AWAITING_REDIRECT and returns a redirectUrl', async () => {
    mock.setNextOutcome('A');
    const appointment = await createAppointment(bookingInput(9), world.staffSession);
    const { payment, redirectUrl } = await collectAppointmentPayment(appointment.id, { method: 'CARD' }, world.staffSession);
    expect(payment.status).toBe('AWAITING_REDIRECT');
    expect(redirectUrl).toBeTruthy();
    expect(payment.providerRef).toMatch(/^MOCK_/);
  });

  it('finalizeRedirectPayment settles a successful payment: PAID, full ledger, commissions, idempotent replay', async () => {
    mock.setNextOutcome('A');
    const appointment = await createAppointment(bookingInput(10), world.staffSession);
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CARD' }, world.staffSession);

    const finalized = await finalizeRedirectPayment(payment.id, world.staffSession);
    expect(finalized.status).toBe('PAID');
    expect(finalized.transactions.map((t) => `${t.type}:${t.status}`)).toEqual([
      'AUTHORIZE:AWAITING_REDIRECT',
      'CAPTURE:AUTHORIZED',
      'CAPTURE:PAID',
    ]);

    const commissions = await db.commission.findMany({ where: { appointmentId: appointment.id } });
    const total = commissions.reduce((sum, c) => sum + c.amountMinor, 0);
    expect(total).toBe(appointment.priceMinor);

    // Both the webhook and the return-page confirm call this — must be safe to race.
    const again = await finalizeRedirectPayment(payment.id, null);
    expect(again.status).toBe('PAID');
    const commissionsAfter = await db.commission.findMany({ where: { appointmentId: appointment.id } });
    expect(commissionsAfter).toHaveLength(commissions.length);
  });

  it('finalizeRedirectPayment marks a declined payment FAILED, not PAID, and generates no commissions', async () => {
    mock.setNextOutcome('D');
    const appointment = await createAppointment(bookingInput(11), world.staffSession);
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CARD' }, world.staffSession);

    const finalized = await finalizeRedirectPayment(payment.id, world.staffSession);
    expect(finalized.status).toBe('FAILED');

    const commissions = await db.commission.findMany({ where: { appointmentId: appointment.id } });
    expect(commissions).toHaveLength(0);
  });

  it('the duplicate-payment guard blocks a second collection attempt while AWAITING_REDIRECT', async () => {
    mock.setNextOutcome('A');
    const appointment = await createAppointment(bookingInput(12), world.staffSession);
    await collectAppointmentPayment(appointment.id, { method: 'CARD' }, world.staffSession);

    await expect(
      collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession)
    ).rejects.toThrow(InvalidPaymentStateError);
  });

  it('cancelAwaitingPayment releases a stuck redirect payment so collection can be retried', async () => {
    mock.setNextOutcome('A');
    const appointment = await createAppointment(bookingInput(13), world.staffSession);
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CARD' }, world.staffSession);

    const cancelled = await cancelAwaitingPayment(payment.id, world.staffSession);
    expect(cancelled.status).toBe('CANCELLED');

    const { payment: retried } = await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);
    expect(retried.status).toBe('PAID');
  });
});

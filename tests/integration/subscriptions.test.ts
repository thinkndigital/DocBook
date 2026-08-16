import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import { collectAppointmentPayment } from '@/lib/services/payments';
import {
  subscribeTenantToPlan,
  runSubscriptionBillingCycle,
  getLatestSubscription,
  getCurrentSubscription,
} from '@/lib/services/subscriptions';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

/**
 * Exercises runSubscriptionBillingCycle's three passes (reminder, expire-to-PAST_DUE,
 * cancel-after-grace) directly against real Subscription rows with backdated
 * currentPeriodEnd values — this is the deterministic way to test a time-based state
 * machine without actually waiting days, and matches how the live Playwright verification
 * separately confirms the same transitions through the real cron route.
 */
describe('subscription billing cycle', () => {
  let world: TestWorld;
  let planId: string;
  let secondPlanId: string;

  beforeAll(async () => {
    world = await createWorld('sub');
    const plans = await db.subscriptionPlan.findMany({ where: { isActive: true }, take: 2 });
    if (plans.length < 2) throw new Error('Need at least 2 active subscription plans seeded to run this suite.');
    planId = plans[0]!.id;
    secondPlanId = plans[1]!.id;
  });

  afterAll(async () => {
    await cleanupWorld(world);
  });

  async function backdatedSubscription(status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE', periodEndOffsetDays: number, reminderSentAt: Date | null = null) {
    const periodEnd = new Date();
    periodEnd.setUTCDate(periodEnd.getUTCDate() + periodEndOffsetDays);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    return db.subscription.create({
      data: { tenantId: world.tenantId, planId, status, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, reminderSentAt },
    });
  }

  it('sends exactly one renewal reminder inside the reminder window, not on a repeat tick', async () => {
    const sub = await backdatedSubscription('ACTIVE', 2); // ends in 2 days, inside the 3-day window

    const first = await runSubscriptionBillingCycle();
    expect(first.remindersSent).toBeGreaterThanOrEqual(1);

    const afterFirst = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(afterFirst.reminderSentAt).not.toBeNull();
    expect(afterFirst.status).toBe('ACTIVE'); // reminder alone must not change status

    const notifCount = await db.notification.count({
      where: { tenantId: world.tenantId, type: 'SUBSCRIPTION_RENEWAL' },
    });
    expect(notifCount).toBeGreaterThan(0);

    // A second tick must not resend it.
    const second = await runSubscriptionBillingCycle();
    const stillOneSubDue = await db.subscription.findMany({
      where: { tenantId: world.tenantId, status: 'ACTIVE', reminderSentAt: { not: null } },
    });
    expect(stillOneSubDue.some((s) => s.id === sub.id)).toBe(true);
    expect(second.remindersSent).toBe(0);

    await db.subscription.delete({ where: { id: sub.id } });
  });

  it('moves an expired ACTIVE subscription to PAST_DUE and notifies once', async () => {
    const sub = await backdatedSubscription('ACTIVE', -1); // ended yesterday

    const result = await runSubscriptionBillingCycle();
    expect(result.pastDueCount).toBeGreaterThanOrEqual(1);

    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe('PAST_DUE');

    const notif = await db.notification.findFirst({
      where: { tenantId: world.tenantId, type: 'SUBSCRIPTION_PAST_DUE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).not.toBeNull();

    // Idempotent: a second tick doesn't re-notify (status is no longer ACTIVE/TRIALING).
    const notifCountBefore = await db.notification.count({ where: { tenantId: world.tenantId, type: 'SUBSCRIPTION_PAST_DUE' } });
    await runSubscriptionBillingCycle();
    const notifCountAfter = await db.notification.count({ where: { tenantId: world.tenantId, type: 'SUBSCRIPTION_PAST_DUE' } });
    expect(notifCountAfter).toBe(notifCountBefore);

    await db.subscription.delete({ where: { id: sub.id } });
  });

  it('cancels a PAST_DUE subscription once it is past the grace period, not before', async () => {
    // 6 days past due — inside the 7-day grace period, must NOT cancel yet.
    const notYet = await backdatedSubscription('PAST_DUE', -6);
    const resultBefore = await runSubscriptionBillingCycle();
    const stillPastDue = await db.subscription.findUniqueOrThrow({ where: { id: notYet.id } });
    expect(stillPastDue.status).toBe('PAST_DUE');

    // 8 days past due — outside the grace period, must cancel.
    const overdue = await backdatedSubscription('PAST_DUE', -8);
    const resultAfter = await runSubscriptionBillingCycle();
    expect(resultAfter.cancelledCount).toBeGreaterThanOrEqual(1);
    const cancelled = await db.subscription.findUniqueOrThrow({ where: { id: overdue.id } });
    expect(cancelled.status).toBe('CANCELLED');

    const notif = await db.notification.findFirst({
      where: { tenantId: world.tenantId, type: 'SUBSCRIPTION_CANCELLED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).not.toBeNull();

    expect(resultBefore).toBeDefined();
    await db.subscription.deleteMany({ where: { id: { in: [notYet.id, overdue.id] } } });
  });

  it('re-subscribing while PAST_DUE supersedes the old row instead of leaving it stranded', async () => {
    const pastDue = await backdatedSubscription('PAST_DUE', -3);

    const renewed = await subscribeTenantToPlan(world.tenantId, secondPlanId, world.staffSession);
    expect(renewed.status).toBe('ACTIVE');
    expect(renewed.planId).toBe(secondPlanId);

    const oldRow = await db.subscription.findUniqueOrThrow({ where: { id: pastDue.id } });
    expect(oldRow.status).toBe('CANCELLED');

    const current = await getCurrentSubscription(world.tenantId);
    expect(current?.id).toBe(renewed.id);

    await db.subscription.deleteMany({ where: { id: { in: [pastDue.id, renewed.id] } } });
  });

  it('a PAST_DUE subscription still gets the plan commission rate, not the platform fallback', async () => {
    const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { id: planId } });
    const sub = await backdatedSubscription('PAST_DUE', -2);

    const appointment = await createAppointment(
      {
        doctorId: world.doctorId,
        branchId: world.branchId,
        serviceId: world.serviceId,
        patientId: world.patientId,
        scheduledAt: futureSlot(3, 9).toISOString(),
        type: 'IN_PERSON',
      },
      world.staffSession
    );
    const { payment } = await collectAppointmentPayment(appointment.id, { method: 'CASH' }, world.staffSession);
    expect(payment.status).toBe('PAID');

    const platformCommission = await db.commission.findFirst({
      where: { appointmentId: appointment.id, entityType: 'PLATFORM' },
    });

    if (plan.bookingCommissionPct > 0) {
      expect(platformCommission).not.toBeNull();
      expect(platformCommission!.amountMinor).toBe(Math.round((appointment.priceMinor * plan.bookingCommissionPct) / 100));
    }

    await db.subscription.delete({ where: { id: sub.id } });
  });
});

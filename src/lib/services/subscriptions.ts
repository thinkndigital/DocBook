import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { dispatchNotification } from '@/lib/services/notifications';
import type { SessionUser } from '@/lib/auth';

export class PlanNotFoundError extends Error {}

// A subscription with days remaining inside this window gets exactly one reminder
// (reminderSentAt is set so a later tick doesn't resend it). A PAST_DUE subscription is
// cancelled once it has been unpaid for this many days past its period end — long enough
// for a clinic to notice and renew, short enough that a genuinely abandoned tenant doesn't
// stay counted as a customer indefinitely.
const REMINDER_WINDOW_DAYS = 3;
const GRACE_PERIOD_DAYS = 7;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * The subscription that governs commission calculation and feature access — ACTIVE or
 * TRIALING only. A PAST_DUE or CANCELLED subscription is a real row (see
 * getLatestSubscription for that) but is not "the current plan" by this definition.
 */
export async function getCurrentSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** For billing-status display: the tenant's most recent subscription regardless of status,
 *  so a PAST_DUE/CANCELLED row is still visible as "you had a plan, here's what happened"
 *  rather than looking identical to "never subscribed". */
export async function getLatestSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Awaited, not fire-and-forget: this runs from a batch/cron context (runSubscriptionBillingCycle),
 * not inside a user request, so there is no "must not block the caller" concern the way
 * there is for a booking confirmation — and a cron tick that returns before its own
 * notifications are durably written would be a real observability gap in its result.
 */
async function notifyTenantAdmins(tenantId: string, event: 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_PAST_DUE' | 'SUBSCRIPTION_CANCELLED', clinicName: string) {
  const admins = await db.user.findMany({
    where: { tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  for (const admin of admins) {
    await dispatchNotification({ event, userId: admin.id, tenantId, vars: { clinicName } });
  }
}

/**
 * Switching plans supersedes the current subscription rather than editing it, so billing
 * history stays intact (the old row keeps its period and becomes CANCELLED). Supersedes
 * any ACTIVE/TRIALING/PAST_DUE row — PAST_DUE is included deliberately, since re-subscribing
 * while past due is exactly "renewing" and must not leave a stray PAST_DUE row behind that
 * never resolves to CANCELLED (nothing else would ever touch it once a newer ACTIVE row
 * exists). Proration is not implemented — see ROADMAP.md.
 */
export async function subscribeTenantToPlan(tenantId: string, planId: string, actor: SessionUser) {
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new PlanNotFoundError('No active plan with that id.');

  const current = await db.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    orderBy: { createdAt: 'desc' },
  });

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  const subscription = await db.$transaction(async (tx) => {
    if (current) {
      await tx.subscription.update({ where: { id: current.id }, data: { status: 'CANCELLED' } });
    }
    return tx.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
      include: { plan: true },
    });
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'SUBSCRIPTION_CHANGED',
    entityType: 'Subscription',
    entityId: subscription.id,
    beforeState: current ? { planId: current.planId, status: current.status } : null,
    afterState: { planId, status: 'ACTIVE' },
  });

  return subscription;
}

/**
 * The recurring-billing "engine" — three idempotent passes, meant to be triggered
 * periodically by an external scheduler (see POST /api/v1/cron/subscriptions/tick) since
 * this deployment target has no built-in cron. No auto-charge happens anywhere in here:
 * renewal is always the tenant admin re-subscribing through subscribeTenantToPlan (cash or
 * a real gateway, same as any other payment) — see DEPLOYMENT.md for why true recurring
 * auto-charge (stored/tokenized card) was deliberately not built this round.
 *
 * Each pass is safe to run on overlapping/repeated ticks:
 *  - Reminders are guarded by reminderSentAt, set in the same pass that sends them.
 *  - PAST_DUE/CANCELLED transitions only ever match rows still in the prior state, so a
 *    row already moved by an earlier tick is not matched again.
 */
export async function runSubscriptionBillingCycle(now: Date = new Date()) {
  let remindersSent = 0;
  let pastDueCount = 0;
  let cancelledCount = 0;

  // 1. Renewal reminders — subscriptions ending inside the reminder window that haven't
  //    already been reminded. Covers TRIALING too ("your trial is ending, subscribe to
  //    continue" is the same message).
  const dueForReminder = await db.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIALING'] },
      reminderSentAt: null,
      currentPeriodEnd: { lte: addDays(now, REMINDER_WINDOW_DAYS), gt: now },
    },
    include: { tenant: { select: { id: true, name: true } } },
  });
  for (const sub of dueForReminder) {
    await notifyTenantAdmins(sub.tenantId, 'SUBSCRIPTION_RENEWAL', sub.tenant.name);
    await db.subscription.update({ where: { id: sub.id }, data: { reminderSentAt: now } });
    remindersSent += 1;
  }

  // 2. Expiry — ACTIVE/TRIALING subscriptions whose period has already ended move to
  //    PAST_DUE, a grace period during which the tenant keeps working normally (see the
  //    "informational only" gating decision — computeCommissionSplit treats PAST_DUE the
  //    same as ACTIVE) but is expected to renew.
  const expired = await db.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lte: now } },
    include: { tenant: { select: { id: true, name: true } } },
  });
  for (const sub of expired) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    await notifyTenantAdmins(sub.tenantId, 'SUBSCRIPTION_PAST_DUE', sub.tenant.name);
    await recordAudit({
      tenantId: sub.tenantId,
      action: 'SUBSCRIPTION_PAST_DUE',
      entityType: 'Subscription',
      entityId: sub.id,
      beforeState: { status: sub.status },
      afterState: { status: 'PAST_DUE' },
    });
    pastDueCount += 1;
  }

  // 3. Cancellation — PAST_DUE subscriptions that have sat unpaid past the grace period.
  const graceDeadline = addDays(now, -GRACE_PERIOD_DAYS);
  const overdue = await db.subscription.findMany({
    where: { status: 'PAST_DUE', currentPeriodEnd: { lte: graceDeadline } },
    include: { tenant: { select: { id: true, name: true } } },
  });
  for (const sub of overdue) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } });
    await notifyTenantAdmins(sub.tenantId, 'SUBSCRIPTION_CANCELLED', sub.tenant.name);
    await recordAudit({
      tenantId: sub.tenantId,
      action: 'SUBSCRIPTION_CANCELLED',
      entityType: 'Subscription',
      entityId: sub.id,
      beforeState: { status: 'PAST_DUE' },
      afterState: { status: 'CANCELLED' },
    });
    cancelledCount += 1;
  }

  return { remindersSent, pastDueCount, cancelledCount };
}

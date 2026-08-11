import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';

export class PlanNotFoundError extends Error {}

export async function getCurrentSubscription(tenantId: string) {
  return db.subscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Switching plans supersedes the current subscription rather than editing it, so billing
 * history stays intact (the old row keeps its period and becomes CANCELLED). Proration and
 * recurring renewal billing are not implemented — they need a scheduler and a real
 * gateway's recurring-charge support; documented in ROADMAP.md rather than faked.
 */
export async function subscribeTenantToPlan(tenantId: string, planId: string, actor: SessionUser) {
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new PlanNotFoundError('No active plan with that id.');

  const current = await getCurrentSubscription(tenantId);

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

import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { createPlanSchema, updatePlanSchema } from '@/lib/validation/admin';

type CreatePlanInput = z.infer<typeof createPlanSchema>;
type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export async function listPlans() {
  return db.subscriptionPlan.findMany({ orderBy: { priceMonthlyMinor: 'asc' } });
}

export async function createPlan(input: CreatePlanInput, actor: SessionUser) {
  const plan = await db.subscriptionPlan.create({
    data: { ...input, features: input.features as Prisma.InputJsonValue },
  });
  await recordAudit({
    actorUserId: actor.id,
    action: 'SUBSCRIPTION_PLAN_CREATED',
    entityType: 'SubscriptionPlan',
    entityId: plan.id,
    afterState: { tier: plan.tier, name: plan.name, priceMonthlyMinor: plan.priceMonthlyMinor },
  });
  return plan;
}

export async function updatePlan(id: string, input: UpdatePlanInput, actor: SessionUser) {
  const before = await db.subscriptionPlan.findUnique({ where: { id } });
  if (!before) return null;
  const plan = await db.subscriptionPlan.update({
    where: { id },
    data: { ...input, features: input.features as Prisma.InputJsonValue | undefined },
  });
  await recordAudit({
    actorUserId: actor.id,
    action: 'SUBSCRIPTION_PLAN_UPDATED',
    entityType: 'SubscriptionPlan',
    entityId: id,
    beforeState: before,
    afterState: plan,
  });
  return plan;
}

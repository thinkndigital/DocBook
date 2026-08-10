import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createBranchSchema, updateBranchSchema } from '@/lib/validation/tenant';
import type { Prisma } from '@prisma/client';

type CreateBranchInput = z.infer<typeof createBranchSchema>;
type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

/**
 * All queries here run inside `runWithTenant` (see withTenantAuthorization) — the
 * tenant-scoping middleware injects `tenantId` automatically, so nothing in this file
 * filters by tenant explicitly.
 */
export async function listBranches() {
  return db.branch.findMany({
    include: { city: true, _count: { select: { doctorBranches: true, staff: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBranch(id: string) {
  return db.branch.findFirst({ where: { id }, include: { city: true } });
}

export async function createBranch(input: CreateBranchInput, actor: SessionUser & { tenantId: string }) {
  const branch = await db.branch.create({
    // tenantId is redundant with the middleware injection at runtime (the tenant-scoping
    // middleware overwrites it with the same value) but required here to satisfy Prisma's
    // generated "unchecked create" type, which doesn't know the middleware exists.
    data: { ...input, tenantId: actor.tenantId, openingHours: input.openingHours as Prisma.InputJsonValue },
  });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'BRANCH_CREATED',
    entityType: 'Branch',
    entityId: branch.id,
    afterState: { name: branch.name, cityId: branch.cityId },
  });
  return branch;
}

export async function updateBranch(id: string, input: UpdateBranchInput, actor: SessionUser & { tenantId: string }) {
  const before = await getBranch(id);
  if (!before) return null;
  const branch = await db.branch.update({
    where: { id },
    data: { ...input, openingHours: input.openingHours as Prisma.InputJsonValue | undefined },
  });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'BRANCH_UPDATED',
    entityType: 'Branch',
    entityId: id,
    beforeState: { name: before.name, isActive: before.isActive },
    afterState: { name: branch.name, isActive: branch.isActive },
  });
  return branch;
}

import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import bcrypt from 'bcryptjs';
import type { TenantStatus, TenantType } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';
import { normalizeEmail } from '@/lib/validation/common';

export interface CreateTenantInput {
  type: TenantType;
  name: string;
  nameAr: string;
  countryId: string;
  adminEmail: string;
  adminName: string;
  adminNameAr?: string;
}

export class TenantConflictError extends Error {}
export class InvalidStatusTransitionError extends Error {}

/**
 * Onboards a tenant and its first TENANT_ADMIN login in one transaction — an admin
 * clicking "add tenant" produces a real, working account, not just a database row (§47).
 */
export async function createTenant(input: CreateTenantInput, actor: SessionUser) {
  const email = normalizeEmail(input.adminEmail);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new TenantConflictError(`A user with email ${email} already exists.`);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12);

  const result = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        type: input.type,
        name: input.name,
        nameAr: input.nameAr,
        countryId: input.countryId,
        status: 'PENDING_VERIFICATION',
      },
    });

    const adminUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: 'TENANT_ADMIN',
        name: input.adminName,
        nameAr: input.adminNameAr,
        status: 'ACTIVE',
        // Created on the shared assigned password; blocked from everything until changed.
        mustChangePassword: true,
      },
    });

    return { tenant, adminUser };
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: result.tenant.id,
    action: 'TENANT_CREATED',
    entityType: 'Tenant',
    entityId: result.tenant.id,
    afterState: { type: result.tenant.type, name: result.tenant.name, status: result.tenant.status },
  });

  return result;
}

export async function listTenants(params: { cursor?: string; limit: number; status?: TenantStatus; type?: TenantType }) {
  const items = await db.tenant.findMany({
    where: {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    include: { country: true, _count: { select: { branches: true, doctors: true, users: true } } },
    orderBy: { createdAt: 'desc' },
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > params.limit;
  const page = hasMore ? items.slice(0, params.limit) : items;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? last.id : null };
}

export async function getTenant(id: string) {
  return db.tenant.findUnique({
    where: { id },
    include: {
      country: true,
      users: { where: { role: 'TENANT_ADMIN' }, select: { id: true, name: true, email: true, status: true } },
      _count: { select: { branches: true, doctors: true, appointments: true } },
    },
  });
}

const ALLOWED_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  PENDING_VERIFICATION: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  REJECTED: [],
};

export async function setTenantStatus(
  id: string,
  nextStatus: TenantStatus,
  reason: string | undefined,
  actor: SessionUser
) {
  const tenant = await db.tenant.findUnique({ where: { id } });
  if (!tenant) return null;

  const allowed = ALLOWED_TRANSITIONS[tenant.status];
  if (!allowed.includes(nextStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move tenant from ${tenant.status} to ${nextStatus}.`);
  }

  const updated = await db.tenant.update({ where: { id }, data: { status: nextStatus } });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: id,
    action: `TENANT_STATUS_${nextStatus}`,
    entityType: 'Tenant',
    entityId: id,
    beforeState: { status: tenant.status },
    afterState: { status: nextStatus, reason: reason ?? null },
  });

  return updated;
}

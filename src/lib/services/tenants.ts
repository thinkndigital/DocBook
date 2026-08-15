import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { resolveInitialPassword } from '@/lib/services/account-provisioning';
import { adminSetUserPassword } from '@/lib/services/password';
import type { Prisma, TenantStatus, TenantType } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';
import { normalizeEmail } from '@/lib/validation/common';
import bcrypt from 'bcryptjs';

export interface CreateTenantInput {
  type: TenantType;
  name: string;
  nameAr: string;
  countryId: string;
  adminEmail: string;
  adminName: string;
  adminNameAr?: string;
  adminInitialPassword?: string;
}

export class TenantConflictError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class InvalidInviteCodeError extends Error {}

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — read aloud over the phone

function randomInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** Collision odds are astronomically low (33^8 space) but a tight retry loop costs nothing. */
async function uniqueInviteCode(tx: Prisma.TransactionClient | typeof db = db): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    const existing = await tx.tenant.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique invite code.');
}

/**
 * Lazily backfills `inviteCode` for tenants created before this field was wired up (every
 * tenant created before this pass) — same pattern as `ensureCalendarFeedToken`. Returns the
 * existing code untouched if one is already set.
 */
export async function ensureTenantInviteCode(tenantId: string): Promise<string> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { inviteCode: true } });
  if (!tenant) throw new TenantConflictError('Tenant not found.');
  if (tenant.inviteCode) return tenant.inviteCode;

  const code = await uniqueInviteCode();
  await db.tenant.update({ where: { id: tenantId }, data: { inviteCode: code } });
  return code;
}

/** Rotating the code revokes the old one instantly — nobody holding the previous code can join. */
export async function regenerateTenantInviteCode(tenantId: string, actor: SessionUser): Promise<string> {
  const code = await uniqueInviteCode();
  await db.tenant.update({ where: { id: tenantId }, data: { inviteCode: code } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'TENANT_INVITE_CODE_REGENERATED',
    entityType: 'Tenant',
    entityId: tenantId,
  });
  return code;
}

/**
 * Public lookup for the doctor self-registration form — a doctor typing in their clinic's
 * invite code needs to see which clinic it is and pick a branch before submitting. Deliberately
 * returns almost nothing: no address, no admin contact, nothing useful to someone without the
 * code. A tenant that's SUSPENDED or REJECTED can't be joined even with a valid code.
 */
export async function findTenantByInviteCode(code: string) {
  const tenant = await db.tenant.findUnique({
    where: { inviteCode: code.trim().toUpperCase() },
    select: {
      id: true,
      name: true,
      nameAr: true,
      status: true,
      deletedAt: true,
      branches: { where: { isActive: true }, select: { id: true, name: true } },
    },
  });
  if (!tenant || tenant.deletedAt || tenant.status === 'SUSPENDED' || tenant.status === 'REJECTED') return null;
  return tenant;
}

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

  const { passwordHash, mustChangePassword } = await resolveInitialPassword(input.adminInitialPassword);
  const inviteCode = await uniqueInviteCode();

  const result = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        type: input.type,
        name: input.name,
        nameAr: input.nameAr,
        countryId: input.countryId,
        status: 'PENDING_VERIFICATION',
        inviteCode,
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
        mustChangePassword,
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

export interface SelfRegisterTenantInput {
  type: TenantType;
  name: string;
  nameAr: string;
  countryId: string;
  adminName: string;
  adminNameAr?: string;
  adminEmail: string;
  password: string;
  branchName: string;
  branchAddress: string;
  cityId: string;
  branchPhone?: string;
}

/**
 * A clinic/hospital registering itself, no admin in the loop. Unlike `createTenant` this
 * chooses the admin's own password (never DEFAULT_ASSIGNED_PASSWORD — nobody assigned it,
 * they typed it) and also creates the first branch, since a tenant with zero branches can't
 * attach a doctor or take a booking. Status still starts PENDING_VERIFICATION — same as an
 * admin-created tenant — which does not block login (only SUSPENDED does, see auth.ts); it
 * just keeps the "not yet reviewed" signal visible to platform admins.
 */
export async function selfRegisterTenant(input: SelfRegisterTenantInput) {
  const email = normalizeEmail(input.adminEmail);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) throw new TenantConflictError(`A user with email ${email} already exists.`);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const inviteCode = await uniqueInviteCode();

  const result = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        type: input.type,
        name: input.name,
        nameAr: input.nameAr,
        countryId: input.countryId,
        status: 'PENDING_VERIFICATION',
        inviteCode,
      },
    });

    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: input.branchName,
        address: input.branchAddress,
        cityId: input.cityId,
        phone: input.branchPhone,
        openingHours: {},
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
        mustChangePassword: false,
      },
    });

    return { tenant, branch, adminUser };
  });

  await recordAudit({
    actorUserId: result.adminUser.id,
    tenantId: result.tenant.id,
    action: 'TENANT_SELF_REGISTERED',
    entityType: 'Tenant',
    entityId: result.tenant.id,
    afterState: { type: result.tenant.type, name: result.tenant.name },
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

/**
 * Reset a tenant's admin-user password. SUPER_ADMIN only (same permission as createTenant),
 * so no tenant scoping is needed — the tenant id itself is the only input, and `findFirst`
 * on `Tenant` runs with no tenant context (SUPER_ADMIN routes bypass the middleware, see
 * ARCHITECTURE.md "Multi-tenancy").
 */
export async function resetTenantAdminPassword(
  tenantId: string,
  newPassword: string | undefined,
  actor: SessionUser
): Promise<boolean> {
  const adminUser = await db.user.findFirst({ where: { tenantId, role: 'TENANT_ADMIN' }, select: { id: true } });
  if (!adminUser) return false;
  await adminSetUserPassword(adminUser.id, newPassword, actor);
  return true;
}

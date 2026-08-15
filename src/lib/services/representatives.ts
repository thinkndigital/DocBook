import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { resolveInitialPassword } from '@/lib/services/account-provisioning';
import { adminSetUserPassword } from '@/lib/services/password';
import type { SessionUser } from '@/lib/auth';
import { normalizeEmail } from '@/lib/validation/common';

export class RepConflictError extends Error {}
export class RepNotFoundError extends Error {}
export class TenantNotAssignedError extends Error {}

const REP_INCLUDE = {
  user: { select: { id: true, name: true, email: true, status: true } },
  assignments: { include: { tenant: { select: { id: true, name: true, nameAr: true, status: true } } } },
} as const;

// ---------- Admin (SUPER_ADMIN) side ----------

/**
 * Representatives are platform-level users (User.tenantId stays null) — one rep manages
 * bookings across several assigned tenants, which is exactly why they can't be modeled as
 * tenant staff. Their reach is defined solely by RepresentativeAssignment rows.
 */
export async function createRepresentative(
  input: {
    email: string;
    name: string;
    nameAr?: string;
    monthlyTargetAmount?: number;
    initialPassword?: string;
  },
  actor: SessionUser
) {
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new RepConflictError(`A user with email ${email} already exists.`);

  const { passwordHash, mustChangePassword } = await resolveInitialPassword(input.initialPassword);

  const rep = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'REPRESENTATIVE',
        name: input.name,
        nameAr: input.nameAr,
        status: 'ACTIVE',
        mustChangePassword,
      },
    });
    return tx.representative.create({
      data: { userId: user.id, monthlyTargetAmount: input.monthlyTargetAmount },
      include: REP_INCLUDE,
    });
  });

  await recordAudit({
    actorUserId: actor.id,
    action: 'REPRESENTATIVE_CREATED',
    entityType: 'Representative',
    entityId: rep.id,
    afterState: { email, monthlyTargetAmount: input.monthlyTargetAmount ?? null },
  });

  return rep;
}

export async function listRepresentatives() {
  return db.representative.findMany({
    include: { ...REP_INCLUDE, _count: { select: { bookedAppointments: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function assignTenantToRep(representativeId: string, tenantId: string, actor: SessionUser) {
  const [rep, tenant] = await Promise.all([
    db.representative.findUnique({ where: { id: representativeId } }),
    db.tenant.findUnique({ where: { id: tenantId } }),
  ]);
  if (!rep || !tenant) throw new RepNotFoundError('Representative or tenant does not exist.');

  const assignment = await db.representativeAssignment.upsert({
    where: { representativeId_tenantId: { representativeId, tenantId } },
    update: {},
    create: { representativeId, tenantId },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'REPRESENTATIVE_ASSIGNED',
    entityType: 'Representative',
    entityId: representativeId,
    afterState: { tenantId },
  });

  return assignment;
}

export async function unassignTenantFromRep(representativeId: string, tenantId: string, actor: SessionUser) {
  await db.representativeAssignment.deleteMany({ where: { representativeId, tenantId } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'REPRESENTATIVE_UNASSIGNED',
    entityType: 'Representative',
    entityId: representativeId,
    afterState: { tenantId },
  });
}

// ---------- Representative (self) side ----------

export async function getOwnRepresentative(userId: string) {
  return db.representative.findUnique({ where: { userId }, include: REP_INCLUDE });
}

/** The single enforcement point for a rep's reach — every rep-facing read/booking path goes through this or listAssignedTenantIds. */
export async function assertRepAssignedToTenant(representativeId: string, tenantId: string) {
  const assignment = await db.representativeAssignment.findUnique({
    where: { representativeId_tenantId: { representativeId, tenantId } },
  });
  if (!assignment) {
    throw new TenantNotAssignedError('This healthcare provider is not assigned to you.');
  }
}

async function listAssignedTenantIds(representativeId: string): Promise<string[]> {
  const assignments = await db.representativeAssignment.findMany({ where: { representativeId } });
  return assignments.map((a) => a.tenantId);
}

export async function listAssignedTenants(representativeId: string) {
  return db.tenant.findMany({
    where: { id: { in: await listAssignedTenantIds(representativeId) }, status: 'ACTIVE', deletedAt: null },
    include: { _count: { select: { branches: true, doctors: true } } },
    orderBy: { name: 'asc' },
  });
}

/** Doctors a rep may book: any doctor of an assigned ACTIVE tenant (verification gates public visibility, not rep booking — the clinic asked for this rep's help). */
export async function listRepBookableDoctors(representativeId: string, tenantId?: string) {
  const assignedIds = await listAssignedTenantIds(representativeId);
  const scope = tenantId ? assignedIds.filter((id) => id === tenantId) : assignedIds;
  return db.doctor.findMany({
    where: { tenantId: { in: scope }, deletedAt: null, tenant: { status: 'ACTIVE' } },
    include: {
      user: { select: { name: true, nameAr: true } },
      specialty: true,
      tenant: { select: { id: true, name: true, nameAr: true } },
      branches: { include: { branch: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listRepBookableServices(representativeId: string) {
  const assignedIds = await listAssignedTenantIds(representativeId);
  return db.service.findMany({
    where: { tenantId: { in: assignedIds }, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listRepBookedAppointments(representativeId: string, filters: { date?: string }) {
  const where: { bookedByRepresentativeId: string; scheduledAt?: { gte: Date; lt: Date } } = {
    bookedByRepresentativeId: representativeId,
  };
  if (filters.date) {
    const dayStart = new Date(`${filters.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    where.scheduledAt = { gte: dayStart, lt: dayEnd };
  }
  return db.appointment.findMany({
    where,
    include: {
      patient: { include: { user: { select: { name: true, email: true } } } },
      doctor: { include: { user: { select: { name: true } } } },
      branch: { select: { name: true } },
      service: { select: { nameAr: true, name: true } },
      tenant: { select: { name: true, nameAr: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  });
}

/**
 * Live performance numbers for the rep dashboard (brief §18) — real aggregates, no
 * placeholders. "Revenue" is the sum of priceMinor on completed bookings this month;
 * commission *rules/payouts* are Phase 7's engine, deliberately absent here.
 */
export async function getRepStats(representativeId: string) {
  const rep = await db.representative.findUnique({ where: { id: representativeId } });
  if (!rep) return null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const monthFilter = { bookedByRepresentativeId: representativeId, createdAt: { gte: monthStart } };

  const [totalBookings, monthBookings, monthCompleted, monthCancelled, revenueAgg] = await Promise.all([
    db.appointment.count({ where: { bookedByRepresentativeId: representativeId } }),
    db.appointment.count({ where: monthFilter }),
    db.appointment.count({ where: { ...monthFilter, status: 'COMPLETED' } }),
    db.appointment.count({ where: { ...monthFilter, status: { in: ['CANCELLED', 'NO_SHOW'] } } }),
    db.appointment.aggregate({
      where: { ...monthFilter, status: 'COMPLETED' },
      _sum: { priceMinor: true },
    }),
  ]);

  const monthRevenueMinor = revenueAgg._sum.priceMinor ?? 0;
  const target = rep.monthlyTargetAmount;

  return {
    totalBookings,
    monthBookings,
    monthCompleted,
    monthCancelled,
    monthRevenueMinor,
    monthlyTargetAmount: target,
    targetAchievementPct: target && target > 0 ? Math.round((monthRevenueMinor / target) * 100) : null,
  };
}

/**
 * Reset a representative's password. No tenant scoping needed — only SUPER_ADMIN holds
 * `representative:manage`, and representatives are platform-level (tenantId is null).
 */
export async function resetRepresentativePassword(
  repId: string,
  newPassword: string | undefined,
  actor: SessionUser
): Promise<boolean> {
  const rep = await db.representative.findUnique({ where: { id: repId }, select: { userId: true } });
  if (!rep) return false;
  await adminSetUserPassword(rep.userId, newPassword, actor);
  return true;
}

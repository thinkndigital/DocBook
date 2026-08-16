import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * SUPER_ADMIN cross-tenant read tooling: audit log, appointment lookup, user lookup.
 * None of this runs inside runWithTenant — per src/lib/tenant.ts, a query issued with no
 * ambient tenant context gets no filter applied at all, which is exactly the intended
 * cross-tenant reach here (same pattern as listTenants/listRepresentatives). Every select
 * below is an explicit allowlist, never `include`, for the same reason
 * PUBLIC_DOCTOR_SELECT is: appointments carry a clinical `notes` field and users carry
 * passwordHash/twoFactorSecret/twoFactorBackupCodes, and none of that may ever reach this
 * surface. This is operational lookup tooling, not a clinical-access or credential-access
 * path — nothing here substitutes for withClinicalAuthorization.
 */

const AUDIT_LOG_INCLUDE = {
  actor: { select: { id: true, name: true, email: true, role: true } },
  tenant: { select: { id: true, name: true } },
} as const;

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  tenantId?: string;
  actorUserId?: string;
  cursor?: string;
  limit: number;
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
  };

  const items = await db.auditLog.findMany({
    where,
    include: AUDIT_LOG_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: filters.limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > filters.limit;
  const page = hasMore ? items.slice(0, filters.limit) : items;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? last.id : null };
}

/** Distinct action/entityType values, purely to populate the filter dropdowns. */
export async function listAuditLogFacets() {
  const [actions, entityTypes] = await Promise.all([
    db.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    db.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ]);
  return { actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entityType) };
}

const ADMIN_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  type: true,
  scheduledAt: true,
  priceMinor: true,
  currency: true,
  tenant: { select: { id: true, name: true } },
  doctor: { select: { user: { select: { name: true } } } },
  patient: { select: { user: { select: { name: true, email: true } } } },
  service: { select: { name: true, nameAr: true } },
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Free-text lookup by appointment id, or by patient/doctor name or patient email. A query
 * under 2 characters returns nothing rather than dumping the platform's appointment table —
 * this is a "find one specific record for a support ticket" tool, not a browsing list.
 */
export async function searchAppointmentsAdmin(query: string, limit = 20) {
  const q = query.trim();
  if (q.length < 2) return [];

  if (UUID_RE.test(q)) {
    const byId = await db.appointment.findFirst({ where: { id: q }, select: ADMIN_APPOINTMENT_SELECT });
    return byId ? [byId] : [];
  }

  return db.appointment.findMany({
    where: {
      OR: [
        { patient: { user: { name: { contains: q, mode: 'insensitive' } } } },
        { patient: { user: { email: { contains: q, mode: 'insensitive' } } } },
        { doctor: { user: { name: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    select: ADMIN_APPOINTMENT_SELECT,
    orderBy: { scheduledAt: 'desc' },
    take: limit,
  });
}

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  nameAr: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  tenantId: true,
  tenant: { select: { id: true, name: true } },
  lastLoginAt: true,
  createdAt: true,
  mustChangePassword: true,
} as const;

/** Same "find one account for a support ticket" shape as searchAppointmentsAdmin. */
export async function searchUsersAdmin(query: string, limit = 20) {
  const q = query.trim();
  if (q.length < 2) return [];

  return db.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
    },
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

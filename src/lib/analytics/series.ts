import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { bucketKey, denseBuckets, type ResolvedRange } from '@/lib/analytics/range';

/**
 * Time-series helpers built on raw SQL.
 *
 * ## READ THIS BEFORE ADDING A QUERY HERE
 *
 * `$queryRaw` **bypasses the tenant middleware in `src/lib/tenant.ts` entirely.** The
 * middleware works by rewriting Prisma's structured `where` arguments; a raw query has no
 * such structure to rewrite, so the automatic isolation that the rest of the codebase
 * relies on does not exist in this file. Every function here therefore takes an explicit
 * `tenantId` and interpolates it as a **parameter** (never string concatenation), and every
 * caller must pass a tenant id that came from the verified session — never from a query
 * string, body, or header.
 *
 * Raw SQL is used at all because date bucketing (`date_trunc`) is not expressible through
 * Prisma's `groupBy`, and the alternative — loading a year of appointment rows into Node to
 * bucket them in JavaScript — is far worse for a page a clinic opens daily.
 *
 * The platform-wide variants take `tenantId: null` and are only ever reachable from
 * `SUPER_ADMIN` routes under `/api/v1/admin/*`, matching how the rest of the codebase
 * treats cross-tenant reads.
 */

export interface SeriesPoint {
  bucket: string;
  value: number;
}

type RawRow = { bucket: Date; value: bigint | number };

function toDensePoints(rows: RawRow[], range: ResolvedRange): SeriesPoint[] {
  const byBucket = new Map(rows.map((row) => [bucketKey(row.bucket, range.granularity), Number(row.value)]));
  return denseBuckets(range).map((bucket) => ({ bucket, value: byBucket.get(bucket) ?? 0 }));
}

/** `date_trunc` unit for the range. Derived from the closed preset set, never from input. */
function truncUnit(range: ResolvedRange): Prisma.Sql {
  return range.granularity === 'month' ? Prisma.sql`'month'` : Prisma.sql`'day'`;
}

/**
 * Appointments created per bucket, optionally filtered to one status.
 *
 * Note this counts by `scheduledAt`, not `createdAt`: a clinic asking "how busy were we"
 * means the day of the appointment, not the day someone clicked book.
 */
export async function appointmentSeries(
  range: ResolvedRange,
  tenantId: string | null,
  status?: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
): Promise<SeriesPoint[]> {
  const rows = await db.$queryRaw<RawRow[]>`
    SELECT date_trunc(${truncUnit(range)}, "scheduledAt") AS bucket, COUNT(*)::bigint AS value
    FROM appointments
    WHERE "deletedAt" IS NULL
      AND "scheduledAt" >= ${range.from}
      AND "scheduledAt" <= ${range.to}
      ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty}
      ${status ? Prisma.sql`AND "status" = ${status}::"AppointmentStatus"` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1
  `;
  return toDensePoints(rows, range);
}

/** Captured payment volume per bucket, in minor units. */
export async function revenueSeries(range: ResolvedRange, tenantId: string | null): Promise<SeriesPoint[]> {
  const rows = await db.$queryRaw<RawRow[]>`
    SELECT date_trunc(${truncUnit(range)}, "createdAt") AS bucket,
           COALESCE(SUM("amountMinor"), 0)::bigint AS value
    FROM payments
    WHERE "status" = 'PAID'::"PaymentStatus"
      AND "createdAt" >= ${range.from}
      AND "createdAt" <= ${range.to}
      ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1
  `;
  return toDensePoints(rows, range);
}

/** New patient registrations per bucket. Platform-wide only — patients aren't tenant-scoped. */
export async function newPatientSeries(range: ResolvedRange): Promise<SeriesPoint[]> {
  const rows = await db.$queryRaw<RawRow[]>`
    SELECT date_trunc(${truncUnit(range)}, u."createdAt") AS bucket, COUNT(*)::bigint AS value
    FROM patients p
    JOIN users u ON u.id = p."userId"
    WHERE u."createdAt" >= ${range.from}
      AND u."createdAt" <= ${range.to}
      AND u."deletedAt" IS NULL
    GROUP BY 1
    ORDER BY 1
  `;
  return toDensePoints(rows, range);
}

export interface BreakdownRow {
  label: string;
  labelAr: string;
  value: number;
}

/** Appointment counts by specialty. */
export async function specialtyBreakdown(range: ResolvedRange, tenantId: string | null): Promise<BreakdownRow[]> {
  const rows = await db.$queryRaw<Array<{ name: string; nameAr: string; value: bigint }>>`
    SELECT s."name", s."nameAr", COUNT(*)::bigint AS value
    FROM appointments a
    JOIN doctors d ON d.id = a."doctorId"
    JOIN specialties s ON s.id = d."specialtyId"
    WHERE a."deletedAt" IS NULL
      AND a."scheduledAt" >= ${range.from}
      AND a."scheduledAt" <= ${range.to}
      ${tenantId ? Prisma.sql`AND a."tenantId" = ${tenantId}` : Prisma.empty}
    GROUP BY s."name", s."nameAr"
    ORDER BY value DESC
    LIMIT 8
  `;
  return rows.map((row) => ({ label: row.name, labelAr: row.nameAr, value: Number(row.value) }));
}

/** Appointment counts by status, for the whole range. */
export async function statusBreakdown(range: ResolvedRange, tenantId: string | null): Promise<BreakdownRow[]> {
  const rows = await db.$queryRaw<Array<{ status: string; value: bigint }>>`
    SELECT "status"::text AS status, COUNT(*)::bigint AS value
    FROM appointments
    WHERE "deletedAt" IS NULL
      AND "scheduledAt" >= ${range.from}
      AND "scheduledAt" <= ${range.to}
      ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.empty}
    GROUP BY 1
    ORDER BY value DESC
  `;
  return rows.map((row) => ({ label: row.status, labelAr: STATUS_AR[row.status] ?? row.status, value: Number(row.value) }));
}

const STATUS_AR: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  CONFIRMED: 'مؤكد',
  CHECKED_IN: 'تم الوصول',
  IN_QUEUE: 'في الطابور',
  CALLED: 'تم النداء',
  IN_CONSULTATION: 'في الكشف',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
  NO_SHOW: 'لم يحضر',
  RESCHEDULED: 'أُعيد جدولته',
};

/** Busiest doctors by appointment count, with their completion rate. */
export async function doctorLeaderboard(
  range: ResolvedRange,
  tenantId: string | null
): Promise<Array<{ doctorName: string; total: number; completed: number; noShows: number }>> {
  const rows = await db.$queryRaw<
    Array<{ name: string; total: bigint; completed: bigint; no_shows: bigint }>
  >`
    SELECT u."name",
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE a."status" = 'COMPLETED'::"AppointmentStatus")::bigint AS completed,
           COUNT(*) FILTER (WHERE a."status" = 'NO_SHOW'::"AppointmentStatus")::bigint AS no_shows
    FROM appointments a
    JOIN doctors d ON d.id = a."doctorId"
    JOIN users u ON u.id = d."userId"
    WHERE a."deletedAt" IS NULL
      AND a."scheduledAt" >= ${range.from}
      AND a."scheduledAt" <= ${range.to}
      ${tenantId ? Prisma.sql`AND a."tenantId" = ${tenantId}` : Prisma.empty}
    GROUP BY u."name"
    ORDER BY total DESC
    LIMIT 10
  `;
  return rows.map((row) => ({
    doctorName: row.name,
    total: Number(row.total),
    completed: Number(row.completed),
    noShows: Number(row.no_shows),
  }));
}

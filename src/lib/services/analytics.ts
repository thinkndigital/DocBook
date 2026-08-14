import { db } from '@/lib/db';
import { formatMinor } from '@/lib/money';
import type { ResolvedRange } from '@/lib/analytics/range';
import {
  appointmentSeries,
  doctorLeaderboard,
  newPatientSeries,
  revenueSeries,
  specialtyBreakdown,
  statusBreakdown,
  type BreakdownRow,
  type SeriesPoint,
} from '@/lib/analytics/series';

/**
 * Role-scoped analytics (brief §36 — every role sees the numbers that are theirs).
 *
 * Four separate builders rather than one parameterised function. That is deliberate: a
 * single `getAnalytics(role, scope)` would make the isolation boundary a runtime branch,
 * and a mistake in that branch would show one tenant another's revenue. Separate functions
 * mean the platform-wide query (`tenantId: null`) is only reachable from a function that
 * only the `SUPER_ADMIN` route calls, and no `if` decides it.
 *
 * Everything returned here is computed from live rows. There are no sampled, cached, or
 * estimated figures anywhere in this file — a clinic reconciling its dashboard against its
 * own payment records must find them equal.
 */

export interface Kpi {
  key: string;
  label: string;
  labelAr: string;
  value: string;
  /** Percentage change vs the immediately preceding window of the same length, when meaningful. */
  deltaPct?: number;
}

export interface AnalyticsResult {
  range: { preset: string; from: string; to: string; granularity: string };
  kpis: Kpi[];
  series: Array<{ key: string; label: string; labelAr: string; points: SeriesPoint[] }>;
  breakdowns: Array<{ key: string; label: string; labelAr: string; rows: BreakdownRow[] }>;
  leaderboard?: Array<{ doctorName: string; total: number; completed: number; noShows: number }>;
  /** Stated in the UI — analytics buckets are UTC, not clinic-local. */
  timezoneNote: string;
}

const TZ_NOTE_AR = 'تُحسب الفترات بتوقيت UTC وليس بالتوقيت المحلي للعيادة.';

/** The window immediately before `range`, same length — the basis for every delta. */
function previousWindow(range: ResolvedRange): { from: Date; to: Date } {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime() - 1) };
}

/**
 * Returns undefined rather than 0 or Infinity when the previous window had nothing.
 * "+100%" against a base of zero is not information, and showing it trains people to
 * ignore the number that matters.
 */
function delta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function rangeMeta(range: ResolvedRange) {
  return {
    preset: range.preset,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    granularity: range.granularity,
  };
}

async function appointmentCounts(range: { from: Date; to: Date }, tenantId: string | null) {
  const where = {
    deletedAt: null,
    scheduledAt: { gte: range.from, lte: range.to },
    ...(tenantId ? { tenantId } : {}),
  };
  const [total, completed, cancelled, noShow] = await Promise.all([
    db.appointment.count({ where }),
    db.appointment.count({ where: { ...where, status: 'COMPLETED' as const } }),
    db.appointment.count({ where: { ...where, status: 'CANCELLED' as const } }),
    db.appointment.count({ where: { ...where, status: 'NO_SHOW' as const } }),
  ]);
  return { total, completed, cancelled, noShow };
}

async function paidTotal(range: { from: Date; to: Date }, tenantId: string | null) {
  const result = await db.payment.aggregate({
    where: { status: 'PAID', createdAt: { gte: range.from, lte: range.to }, ...(tenantId ? { tenantId } : {}) },
    _sum: { amountMinor: true },
  });
  return result._sum.amountMinor ?? 0;
}

function attendanceKpis(
  current: Awaited<ReturnType<typeof appointmentCounts>>,
  previous: Awaited<ReturnType<typeof appointmentCounts>>
): Kpi[] {
  // Denominator is appointments that actually reached an outcome. Dividing no-shows by
  // *all* bookings would quietly shrink the rate every time the range includes future
  // appointments that haven't happened yet.
  const settled = current.completed + current.noShow;
  const prevSettled = previous.completed + previous.noShow;
  const noShowRate = settled > 0 ? (current.noShow / settled) * 100 : 0;
  const prevNoShowRate = prevSettled > 0 ? (previous.noShow / prevSettled) * 100 : 0;

  return [
    {
      key: 'appointments',
      label: 'Appointments',
      labelAr: 'المواعيد',
      value: String(current.total),
      ...(delta(current.total, previous.total) !== undefined ? { deltaPct: delta(current.total, previous.total)! } : {}),
    },
    {
      key: 'completed',
      label: 'Completed',
      labelAr: 'مكتملة',
      value: String(current.completed),
      ...(delta(current.completed, previous.completed) !== undefined
        ? { deltaPct: delta(current.completed, previous.completed)! }
        : {}),
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      labelAr: 'ملغاة',
      value: String(current.cancelled),
    },
    {
      key: 'noShowRate',
      label: 'No-show rate',
      labelAr: 'نسبة عدم الحضور',
      value: `${noShowRate.toFixed(1)}%`,
      ...(delta(noShowRate, prevNoShowRate) !== undefined ? { deltaPct: delta(noShowRate, prevNoShowRate)! } : {}),
    },
  ];
}

/** Platform-wide analytics. Only reachable from SUPER_ADMIN routes. */
export async function getPlatformAnalytics(range: ResolvedRange): Promise<AnalyticsResult> {
  const prev = previousWindow(range);

  const [current, previous, revenue, prevRevenue, tenants, activeTenants, doctors, patients] = await Promise.all([
    appointmentCounts(range, null),
    appointmentCounts(prev, null),
    paidTotal(range, null),
    paidTotal(prev, null),
    db.tenant.count({ where: { deletedAt: null } }),
    db.tenant.count({ where: { status: 'ACTIVE' } }),
    db.doctor.count({ where: { deletedAt: null } }),
    db.patient.count(),
  ]);

  const platformCommission = await db.commission.aggregate({
    where: { entityType: 'PLATFORM', createdAt: { gte: range.from, lte: range.to } },
    _sum: { amountMinor: true },
  });

  const currency = await defaultCurrency();

  const [bookings, revenueSeriesPoints, patientsSeries, specialties, statuses, leaders] = await Promise.all([
    appointmentSeries(range, null),
    revenueSeries(range, null),
    newPatientSeries(range),
    specialtyBreakdown(range, null),
    statusBreakdown(range, null),
    doctorLeaderboard(range, null),
  ]);

  return {
    range: rangeMeta(range),
    kpis: [
      ...attendanceKpis(current, previous),
      {
        key: 'gmv',
        label: 'Booking value collected',
        labelAr: 'قيمة الحجوزات المحصّلة',
        value: formatMinor(revenue, currency),
        ...(delta(revenue, prevRevenue) !== undefined ? { deltaPct: delta(revenue, prevRevenue)! } : {}),
      },
      {
        key: 'platformCommission',
        label: 'Platform commission',
        labelAr: 'عمولة المنصة',
        value: formatMinor(platformCommission._sum.amountMinor ?? 0, currency),
      },
      { key: 'tenants', label: 'Healthcare providers', labelAr: 'الجهات الصحية', value: `${activeTenants}/${tenants}` },
      { key: 'doctors', label: 'Doctors', labelAr: 'الأطباء', value: String(doctors) },
      { key: 'patients', label: 'Patients', labelAr: 'المرضى', value: String(patients) },
    ],
    series: [
      { key: 'bookings', label: 'Appointments', labelAr: 'المواعيد', points: bookings },
      { key: 'revenue', label: 'Collected', labelAr: 'المحصّل', points: revenueSeriesPoints },
      { key: 'newPatients', label: 'New patients', labelAr: 'مرضى جدد', points: patientsSeries },
    ],
    breakdowns: [
      { key: 'specialty', label: 'By specialty', labelAr: 'حسب التخصص', rows: specialties },
      { key: 'status', label: 'By status', labelAr: 'حسب الحالة', rows: statuses },
    ],
    leaderboard: leaders,
    timezoneNote: TZ_NOTE_AR,
  };
}

/**
 * Tenant analytics. Call inside the caller's tenant context; `tenantId` must come from the
 * verified session, because the raw series queries take it as an explicit parameter and
 * have no middleware protecting them (see `src/lib/analytics/series.ts`).
 */
export async function getTenantAnalytics(range: ResolvedRange, tenantId: string): Promise<AnalyticsResult> {
  const prev = previousWindow(range);

  const [current, previous, revenue, prevRevenue] = await Promise.all([
    appointmentCounts(range, tenantId),
    appointmentCounts(prev, tenantId),
    paidTotal(range, tenantId),
    paidTotal(prev, tenantId),
  ]);

  const currency = await defaultCurrency();

  const [bookings, revenuePoints, completedPoints, specialties, statuses, leaders] = await Promise.all([
    appointmentSeries(range, tenantId),
    revenueSeries(range, tenantId),
    appointmentSeries(range, tenantId, 'COMPLETED'),
    specialtyBreakdown(range, tenantId),
    statusBreakdown(range, tenantId),
    doctorLeaderboard(range, tenantId),
  ]);

  const clinicShare = await db.commission.aggregate({
    where: { entityType: 'CLINIC', tenantId, createdAt: { gte: range.from, lte: range.to } },
    _sum: { amountMinor: true },
  });

  return {
    range: rangeMeta(range),
    kpis: [
      ...attendanceKpis(current, previous),
      {
        key: 'collected',
        label: 'Collected',
        labelAr: 'المحصّل',
        value: formatMinor(revenue, currency),
        ...(delta(revenue, prevRevenue) !== undefined ? { deltaPct: delta(revenue, prevRevenue)! } : {}),
      },
      {
        key: 'clinicShare',
        label: 'Your share after commission',
        labelAr: 'حصتك بعد العمولة',
        value: formatMinor(clinicShare._sum.amountMinor ?? 0, currency),
      },
    ],
    series: [
      { key: 'bookings', label: 'Appointments', labelAr: 'المواعيد', points: bookings },
      { key: 'completed', label: 'Completed', labelAr: 'مكتملة', points: completedPoints },
      { key: 'revenue', label: 'Collected', labelAr: 'المحصّل', points: revenuePoints },
    ],
    breakdowns: [
      { key: 'specialty', label: 'By specialty', labelAr: 'حسب التخصص', rows: specialties },
      { key: 'status', label: 'By status', labelAr: 'حسب الحالة', rows: statuses },
    ],
    leaderboard: leaders,
    timezoneNote: TZ_NOTE_AR,
  };
}

/** A doctor's own numbers. Scoped by doctorId resolved from the session's user, not by input. */
export async function getDoctorAnalytics(range: ResolvedRange, userId: string): Promise<AnalyticsResult | null> {
  const doctor = await db.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) return null;

  const prev = previousWindow(range);
  const baseWhere = { deletedAt: null, doctorId: doctor.id };

  async function counts(window: { from: Date; to: Date }) {
    const where = { ...baseWhere, scheduledAt: { gte: window.from, lte: window.to } };
    const [total, completed, cancelled, noShow] = await Promise.all([
      db.appointment.count({ where }),
      db.appointment.count({ where: { ...where, status: 'COMPLETED' as const } }),
      db.appointment.count({ where: { ...where, status: 'CANCELLED' as const } }),
      db.appointment.count({ where: { ...where, status: 'NO_SHOW' as const } }),
    ]);
    return { total, completed, cancelled, noShow };
  }

  const [current, previous] = await Promise.all([counts(range), counts(prev)]);

  const earnings = await db.commission.aggregate({
    where: {
      entityType: 'DOCTOR',
      createdAt: { gte: range.from, lte: range.to },
      appointment: { doctorId: doctor.id },
    },
    _sum: { amountMinor: true },
  });

  // Per-day counts for one doctor are small enough to bucket in Node, which keeps this
  // path off the raw-SQL surface entirely.
  const rows = await db.appointment.findMany({
    where: { ...baseWhere, scheduledAt: { gte: range.from, lte: range.to } },
    select: { scheduledAt: true },
  });
  const { bucketKey, denseBuckets } = await import('@/lib/analytics/range');
  const tally = new Map<string, number>();
  for (const row of rows) {
    const key = bucketKey(row.scheduledAt, range.granularity);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const points = denseBuckets(range).map((bucket) => ({ bucket, value: tally.get(bucket) ?? 0 }));

  const currency = await defaultCurrency();

  return {
    range: rangeMeta(range),
    kpis: [
      ...attendanceKpis(current, previous),
      {
        key: 'earnings',
        label: 'Your commission earnings',
        labelAr: 'أرباحك من العمولة',
        value: formatMinor(earnings._sum.amountMinor ?? 0, currency),
      },
    ],
    series: [{ key: 'bookings', label: 'Appointments', labelAr: 'المواعيد', points }],
    breakdowns: [],
    timezoneNote: TZ_NOTE_AR,
  };
}

/** A representative's own numbers. Scoped by representativeId resolved from the session. */
export async function getRepresentativeAnalytics(range: ResolvedRange, userId: string): Promise<AnalyticsResult | null> {
  const rep = await db.representative.findUnique({ where: { userId }, select: { id: true } });
  if (!rep) return null;
  // Bound to a plain string: TypeScript's narrowing of `rep` doesn't reach inside the async
  // closure below, and widening the closure's types would hide the real guarantee.
  const representativeId = rep.id;

  const prev = previousWindow(range);

  async function bookings(window: { from: Date; to: Date }) {
    const where = {
      deletedAt: null,
      bookedByRepresentativeId: representativeId,
      scheduledAt: { gte: window.from, lte: window.to },
    };
    const [total, completed, noShow] = await Promise.all([
      db.appointment.count({ where }),
      db.appointment.count({ where: { ...where, status: 'COMPLETED' as const } }),
      db.appointment.count({ where: { ...where, status: 'NO_SHOW' as const } }),
    ]);
    return { total, completed, cancelled: 0, noShow };
  }

  const [current, previous] = await Promise.all([bookings(range), bookings(prev)]);

  const [earned, pending] = await Promise.all([
    db.commission.aggregate({
      where: { representativeId, status: 'PAID', createdAt: { gte: range.from, lte: range.to } },
      _sum: { amountMinor: true },
    }),
    db.commission.aggregate({
      where: { representativeId, status: 'PENDING' },
      _sum: { amountMinor: true },
    }),
  ]);

  const rows = await db.appointment.findMany({
    where: { deletedAt: null, bookedByRepresentativeId: representativeId, scheduledAt: { gte: range.from, lte: range.to } },
    select: { scheduledAt: true },
  });
  const { bucketKey, denseBuckets } = await import('@/lib/analytics/range');
  const tally = new Map<string, number>();
  for (const row of rows) {
    const key = bucketKey(row.scheduledAt, range.granularity);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const points = denseBuckets(range).map((bucket) => ({ bucket, value: tally.get(bucket) ?? 0 }));

  const currency = await defaultCurrency();

  return {
    range: rangeMeta(range),
    kpis: [
      { key: 'bookings', label: 'Bookings made', labelAr: 'الحجوزات', value: String(current.total),
        ...(delta(current.total, previous.total) !== undefined ? { deltaPct: delta(current.total, previous.total)! } : {}) },
      { key: 'completed', label: 'Completed', labelAr: 'مكتملة', value: String(current.completed) },
      { key: 'earned', label: 'Commission paid', labelAr: 'عمولة مدفوعة', value: formatMinor(earned._sum.amountMinor ?? 0, currency) },
      { key: 'pending', label: 'Commission pending', labelAr: 'عمولة معلّقة', value: formatMinor(pending._sum.amountMinor ?? 0, currency) },
    ],
    series: [{ key: 'bookings', label: 'Bookings', labelAr: 'الحجوزات', points }],
    breakdowns: [],
    timezoneNote: TZ_NOTE_AR,
  };
}

/**
 * The platform is multi-currency by design, but no view here mixes currencies yet — a
 * tenant transacts in one. Reading it from data rather than hard-coding "JOD" keeps the
 * §26 "no Jordan-specific logic in application code" rule intact; a genuinely
 * multi-currency rollup needs per-currency subtotals, which is a product decision, not a
 * formatting one.
 */
async function defaultCurrency(): Promise<string> {
  const row = await db.appointment.findFirst({
    where: { deletedAt: null },
    select: { currency: true },
    orderBy: { createdAt: 'desc' },
  });
  return row?.currency ?? 'JOD';
}

import { db } from '@/lib/db';

/**
 * No-show risk scoring (brief §19: "no-show prediction").
 *
 * ## Why this is not a language-model call — a deliberate decision
 *
 * The obvious way to satisfy "AI no-show prediction" is to hand appointment history to an
 * LLM and ask for a probability. That would be worse than useless here, on three counts:
 *
 * 1. **It would be unaccountable.** A clinic acts on this — overbooking a slot, calling a
 *    patient, charging a deposit. "The model said 80%" is not a defensible basis for
 *    treating one patient differently from another, and in several of the markets this
 *    platform targets it is the kind of decision a regulator will ask you to justify.
 * 2. **It would leak.** Scoring every upcoming appointment means sending the whole day's
 *    patient history to a third party, continuously, for a number that arithmetic
 *    produces locally.
 * 3. **It would be less accurate.** No-show behaviour is a base-rate problem. A patient's
 *    own attendance record is the strongest available signal and it is a division.
 *
 * So this is a transparent additive model over real history. Every factor that moves the
 * score is returned with it, in both languages, so the receptionist looking at the number
 * can see *why* — and disagree with it. The AI in this feature is the narrative layer in
 * `clinic-briefing.ts` that describes the aggregate; the scoring itself stays arithmetic.
 *
 * The weights below are a documented starting point, not fitted parameters. There is no
 * historical dataset to fit against before the platform has run for a season. They encode
 * ordinary clinic experience (a prior no-show predicts the next one; brand-new patients
 * are less reliable than established ones; distant bookings decay) and are meant to be
 * re-fitted from `Appointment` history once there is enough of it — which is Phase 11's
 * analytics work, not something to fake now.
 */

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFactor {
  /** Points this factor contributed. Positive raises risk, negative lowers it. */
  points: number;
  label: string;
  labelAr: string;
}

export interface AppointmentRisk {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  scheduledAt: Date;
  /** 0–100. Presented as a band in the UI; the raw number is for ordering. */
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
}

/** Base rate before any patient-specific signal. Deliberately visible rather than buried in the maths. */
const BASE_SCORE = 15;

const HISTORY_LOOKBACK_MONTHS = 12;

function band(score: number): RiskBand {
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

interface PatientHistory {
  total: number;
  noShows: number;
  lateCancellations: number;
}

function scoreFromHistory(history: PatientHistory, leadTimeDays: number, isFirstVisit: boolean): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (isFirstVisit) {
    factors.push({
      points: 12,
      label: 'First appointment with this clinic — no attendance history',
      labelAr: 'أول موعد مع هذه العيادة — لا يوجد سجل حضور',
    });
  } else if (history.total > 0) {
    const rate = history.noShows / history.total;
    if (history.noShows === 0) {
      factors.push({
        points: -10,
        label: `Attended all ${history.total} previous appointments`,
        labelAr: `حضر جميع المواعيد السابقة (${history.total})`,
      });
    } else {
      // Scaled by rate rather than raw count, so one miss out of twenty is not treated
      // like three out of four.
      const points = Math.round(40 * rate) + 10;
      factors.push({
        points,
        label: `${history.noShows} no-show(s) out of ${history.total} appointments`,
        labelAr: `${history.noShows} تخلّف عن الحضور من أصل ${history.total} موعدًا`,
      });
    }

    if (history.lateCancellations > 0) {
      factors.push({
        points: Math.min(12, history.lateCancellations * 4),
        label: `${history.lateCancellations} cancellation(s) within 24 hours`,
        labelAr: `${history.lateCancellations} إلغاء خلال أقل من ٢٤ ساعة`,
      });
    }
  }

  if (leadTimeDays >= 21) {
    factors.push({
      points: 10,
      label: 'Booked more than three weeks ahead',
      labelAr: 'حُجز قبل أكثر من ثلاثة أسابيع',
    });
  } else if (leadTimeDays >= 7) {
    factors.push({ points: 5, label: 'Booked over a week ahead', labelAr: 'حُجز قبل أكثر من أسبوع' });
  } else if (leadTimeDays <= 1) {
    factors.push({
      points: -8,
      label: 'Booked within a day of the appointment',
      labelAr: 'حُجز قبل يوم واحد أو أقل من الموعد',
    });
  }

  return factors;
}

/**
 * Scores upcoming appointments for the caller's tenant.
 *
 * Runs inside the ambient tenant context (call it from `withTenantAuthorization` /
 * `runInSessionTenant`), so the appointment queries are scoped by the Prisma middleware —
 * a clinic can only ever score its own bookings.
 */
export async function scoreUpcomingAppointments(options: { days?: number; limit?: number } = {}): Promise<AppointmentRisk[]> {
  const days = options.days ?? 7;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const upcoming = await db.appointment.findMany({
    where: {
      deletedAt: null,
      scheduledAt: { gte: now, lte: until },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    select: {
      id: true,
      patientId: true,
      scheduledAt: true,
      createdAt: true,
      patient: { select: { user: { select: { name: true } } } },
      doctor: { select: { user: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: options.limit ?? 100,
  });

  if (upcoming.length === 0) return [];

  const since = new Date(now);
  since.setMonth(since.getMonth() - HISTORY_LOOKBACK_MONTHS);

  // One grouped query for the whole page rather than a per-appointment lookup: a busy
  // clinic's week is hundreds of rows, and N+1 here would make the insights page the
  // slowest in the product.
  const patientIds = [...new Set(upcoming.map((a) => a.patientId))];
  const history = await db.appointment.groupBy({
    by: ['patientId', 'status'],
    where: { patientId: { in: patientIds }, scheduledAt: { gte: since, lt: now }, deletedAt: null },
    _count: { _all: true },
  });

  const byPatient = new Map<string, PatientHistory>();
  for (const row of history) {
    const entry = byPatient.get(row.patientId) ?? { total: 0, noShows: 0, lateCancellations: 0 };
    entry.total += row._count._all;
    if (row.status === 'NO_SHOW') entry.noShows += row._count._all;
    byPatient.set(row.patientId, entry);
  }

  // Late cancellations aren't a status — they're a CANCELLED row whose update landed
  // within 24h of the slot. Counted separately so the signal isn't lost in "cancelled".
  const lateCancellations = await db.appointment.findMany({
    where: { patientId: { in: patientIds }, status: 'CANCELLED', scheduledAt: { gte: since, lt: now }, deletedAt: null },
    select: { patientId: true, scheduledAt: true, updatedAt: true },
  });
  for (const row of lateCancellations) {
    const hoursBefore = (row.scheduledAt.getTime() - row.updatedAt.getTime()) / 3_600_000;
    if (hoursBefore >= 0 && hoursBefore <= 24) {
      const entry = byPatient.get(row.patientId) ?? { total: 0, noShows: 0, lateCancellations: 0 };
      entry.lateCancellations += 1;
      byPatient.set(row.patientId, entry);
    }
  }

  return upcoming.map((appointment) => {
    const patientHistory = byPatient.get(appointment.patientId) ?? { total: 0, noShows: 0, lateCancellations: 0 };
    const leadTimeDays = (appointment.scheduledAt.getTime() - appointment.createdAt.getTime()) / 86_400_000;
    const factors = scoreFromHistory(patientHistory, leadTimeDays, patientHistory.total === 0);
    const score = Math.max(0, Math.min(100, BASE_SCORE + factors.reduce((sum, f) => sum + f.points, 0)));

    return {
      appointmentId: appointment.id,
      patientName: appointment.patient.user.name,
      doctorName: appointment.doctor.user.name,
      scheduledAt: appointment.scheduledAt,
      score,
      band: band(score),
      factors,
    };
  });
}

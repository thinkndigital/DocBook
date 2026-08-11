import { db } from '@/lib/db';
import { formatMinor } from '@/lib/money';
import { getAiAssistant } from '@/lib/ai';
import { AiUnavailableError, type BriefingMetric } from '@/lib/ai/provider';
import { MEDICAL_DISCLAIMER_VERSION, OPERATIONAL_DISCLAIMER, disclaimerFor } from '@/lib/ai/disclaimers';
import { checkRateLimit, recordAiUsage } from '@/lib/ai/usage';
import { scoreUpcomingAppointments, type AppointmentRisk } from '@/lib/services/no-show-risk';

/**
 * Clinic-side operational briefing (brief §19: clinic AI assistant / summaries).
 *
 * ## Numbers first, prose second
 *
 * Every figure here is computed by the queries below. The model is handed the finished
 * numbers and asked only to write two to four sentences over them. It cannot query, cannot
 * arithmetic, and cannot reach any table. This means the worst case for a bad model
 * response is clumsy prose next to correct numbers — never a wrong number presented as
 * fact, which is the failure mode that would make a clinic distrust the whole product.
 *
 * The metrics are returned alongside the narrative for the same reason, and the UI shows
 * both. The narrative is a convenience over the data, never a replacement for it.
 *
 * ## No clinical content, by construction
 *
 * Everything sent out is a count, a sum of money, or a duration. No patient name, no
 * appointment id, no diagnosis, no service name — service names can be clinically
 * revealing ("oncology follow-up") and are aggregated away rather than listed.
 */

export interface ClinicBriefing {
  narrative: string;
  metrics: BriefingMetric[];
  observations: string[];
  highRisk: AppointmentRisk[];
  disclaimer: string;
  disclaimerVersion: string;
  provider: string;
  /** True when the provider failed and the metrics are rendered without narrative prose. */
  degraded: boolean;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface BriefingRequest {
  locale: 'ar' | 'en';
  actorKey: string;
  userId: string;
  tenantId: string;
}

/**
 * Must be called inside the caller's tenant context (`withTenantAuthorization` /
 * `runInSessionTenant`) — every query below relies on the Prisma middleware for scoping,
 * exactly like the rest of the tenant services.
 */
export async function buildClinicBriefing(request: BriefingRequest): Promise<ClinicBriefing> {
  const verdict = await checkRateLimit('CLINIC_BRIEFING', request.actorKey);
  if (!verdict.allowed) {
    // Unlike the patient-facing services, a rate-limited briefing degrades rather than
    // errors: the numbers are local and cost nothing, so the page still renders fully —
    // it just does so without new prose.
    const data = await gatherBriefingData(request.locale);
    return {
      narrative: '',
      ...data,
      disclaimer: disclaimerFor(OPERATIONAL_DISCLAIMER, request.locale),
      disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
      provider: getAiAssistant().id,
      degraded: true,
    };
  }

  const startedAt = Date.now();
  const data = await gatherBriefingData(request.locale);
  const assistant = getAiAssistant();

  let narrative = '';
  let degraded = false;
  try {
    const result = await assistant.briefing({
      locale: request.locale,
      metrics: data.metrics,
      observations: data.observations,
    });
    narrative = result.narrative;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      // eslint-disable-next-line no-console
      console.error('[clinic-briefing] Assistant failed:', err instanceof Error ? err.message : err);
    }
    degraded = true;
  }

  await recordAiUsage({
    kind: 'CLINIC_BRIEFING',
    actorKey: request.actorKey,
    provider: assistant.id,
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    userId: request.userId,
    tenantId: request.tenantId,
    latencyMs: Date.now() - startedAt,
    succeeded: !degraded,
  });

  return {
    narrative,
    ...data,
    disclaimer: disclaimerFor(OPERATIONAL_DISCLAIMER, request.locale),
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    provider: assistant.id,
    degraded,
  };
}

async function gatherBriefingData(locale: 'ar' | 'en'): Promise<{
  metrics: BriefingMetric[];
  observations: string[];
  highRisk: AppointmentRisk[];
}> {
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);

  const [todayCount, weekCount, cancelledToday, noShows30d, completed30d, revenue30d, risks] = await Promise.all([
    db.appointment.count({ where: { deletedAt: null, scheduledAt: { gte: today, lt: tomorrow } } }),
    db.appointment.count({ where: { deletedAt: null, scheduledAt: { gte: today, lt: weekAhead } } }),
    db.appointment.count({
      where: { deletedAt: null, status: 'CANCELLED', scheduledAt: { gte: today, lt: tomorrow } },
    }),
    db.appointment.count({ where: { deletedAt: null, status: 'NO_SHOW', scheduledAt: { gte: monthAgo, lt: today } } }),
    db.appointment.count({ where: { deletedAt: null, status: 'COMPLETED', scheduledAt: { gte: monthAgo, lt: today } } }),
    db.payment.aggregate({
      where: { status: 'PAID', createdAt: { gte: monthAgo } },
      _sum: { amountMinor: true },
    }),
    scoreUpcomingAppointments({ days: 7 }),
  ]);

  const currency = await db.appointment
    .findFirst({ where: { deletedAt: null }, select: { currency: true }, orderBy: { createdAt: 'desc' } })
    .then((a) => a?.currency ?? 'JOD');

  const attended = completed30d + noShows30d;
  const noShowRate = attended > 0 ? (noShows30d / attended) * 100 : 0;

  const metrics: BriefingMetric[] = [
    { label: 'Appointments today', labelAr: 'مواعيد اليوم', value: String(todayCount) },
    { label: 'Appointments next 7 days', labelAr: 'مواعيد الأيام السبعة القادمة', value: String(weekCount) },
    { label: 'Cancelled today', labelAr: 'ملغاة اليوم', value: String(cancelledToday) },
    { label: 'No-show rate (30 days)', labelAr: 'نسبة التخلّف عن الحضور (٣٠ يومًا)', value: `${noShowRate.toFixed(1)}%` },
    { label: 'Completed (30 days)', labelAr: 'مكتملة (٣٠ يومًا)', value: String(completed30d) },
    {
      label: 'Collected (30 days)',
      labelAr: 'المحصّل (٣٠ يومًا)',
      value: formatMinor(revenue30d._sum.amountMinor ?? 0, currency),
    },
  ];

  const highRisk = risks.filter((r) => r.band === 'HIGH');
  const observations: string[] = [];

  if (highRisk.length > 0) {
    observations.push(
      locale === 'ar'
        ? `${highRisk.length} موعدًا في الأيام السبعة القادمة مصنّف كخطر تخلّف مرتفع.`
        : `${highRisk.length} appointment(s) in the next 7 days are scored high risk of no-show.`
    );
  }
  if (noShowRate > 15) {
    observations.push(
      locale === 'ar'
        ? 'نسبة التخلّف عن الحضور خلال ٣٠ يومًا أعلى من ١٥٪.'
        : 'The 30-day no-show rate is above 15%.'
    );
  }
  if (todayCount === 0) {
    observations.push(
      locale === 'ar' ? 'لا توجد مواعيد مجدولة لليوم.' : 'There are no appointments scheduled for today.'
    );
  }

  return { metrics, observations, highRisk };
}

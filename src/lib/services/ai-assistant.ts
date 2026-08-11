import { db } from '@/lib/db';
import { formatMinor } from '@/lib/money';
import { getAiAssistant } from '@/lib/ai';
import { AiUnavailableError } from '@/lib/ai/provider';
import { ASSISTANT_DISCLAIMER, MEDICAL_DISCLAIMER_VERSION, disclaimerFor } from '@/lib/ai/disclaimers';
import { detectRedFlags, looksLikeInjection, MAX_QUESTION_CHARS } from '@/lib/ai/safety';
import { EMERGENCY_GUIDANCE } from '@/lib/ai/disclaimers';
import { checkRateLimit, recordAiUsage } from '@/lib/ai/usage';
import { RateLimitedError } from '@/lib/services/ai-triage';

/**
 * Patient assistant — answers questions about the patient's own bookings and about using
 * the platform.
 *
 * ## The context boundary
 *
 * `buildPatientContext` is the only thing that decides what the model can see, and it is
 * built from a deliberately narrow query: appointment time, doctor name, specialty,
 * branch, status, price. It does **not** read `MedicalRecord`, `Prescription`,
 * `Attachment`, or the appointment's own `notes` field — the last one matters, because
 * `notes` is free text a receptionist types and is the most likely place for clinical
 * detail to end up on an otherwise-operational row.
 *
 * This is a stricter line than "the assistant is not allowed to discuss medical history".
 * The data never enters the prompt, so a prompt injection cannot extract what was never
 * there. That is why `looksLikeInjection` here only flags for audit rather than blocking:
 * blocking would be the defense only if the context were sensitive, and it isn't.
 *
 * Note the asymmetry with Phase 8's clinical access control: that gate decides who may
 * read clinical data *inside* the platform. This one decides what may leave it. A doctor
 * legitimately passing `clinical-access.ts` still does not get their patient's diagnoses
 * forwarded to a third-party model, because no code path does that.
 */

export interface AssistantRequest {
  question: string;
  locale: 'ar' | 'en';
  userId: string;
  actorKey: string;
}

export interface AssistantResponse {
  answer: string;
  declined: boolean;
  urgent: boolean;
  emergencyGuidance?: string;
  disclaimer: string;
  disclaimerVersion: string;
  provider: string;
}

function formatWhen(date: Date, locale: 'ar' | 'en'): string {
  // Fixed UTC rendering rather than a locale-formatted local time: the platform stores UTC
  // and has no per-user timezone yet, and a time silently rendered in the *server's* zone
  // is worse than an explicitly-labelled UTC one for something a patient may act on.
  const iso = date.toISOString().slice(0, 16).replace('T', ' ');
  return locale === 'ar' ? `${iso} بتوقيت UTC` : `${iso} UTC`;
}

/**
 * Assembles the non-clinical facts the assistant may use. Every field here is one the
 * patient already sees on their own dashboard.
 */
export async function buildPatientContext(userId: string, locale: 'ar' | 'en'): Promise<string[]> {
  const patient = await db.patient.findUnique({ where: { userId }, select: { id: true } });
  if (!patient) return [];

  const appointments = await db.appointment.findMany({
    where: { patientId: patient.id, deletedAt: null, scheduledAt: { gte: new Date() } },
    // An explicit `select`, not an `include`: an include would pull `notes` and every
    // future column added to Appointment straight into a third-party prompt. This list has
    // to be widened deliberately, which is the point.
    select: {
      scheduledAt: true,
      status: true,
      durationMinutes: true,
      priceMinor: true,
      currency: true,
      doctor: { select: { user: { select: { name: true } }, specialty: { select: { name: true, nameAr: true } } } },
      branch: { select: { name: true, address: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
  });

  return appointments.map((a) => {
    const specialty = locale === 'ar' ? a.doctor.specialty.nameAr : a.doctor.specialty.name;
    const money = formatMinor(a.priceMinor, a.currency);
    // Doctor names are stored with their title already ("Dr. Laila Haddad" / "د. ليلى حداد"),
    // so nothing is prepended here — doing so produced "Dr. Dr. Laila Haddad" in the context
    // handed to the model, which is the kind of small wrongness that makes an assistant read
    // as untrustworthy even when the facts are right.
    const doctorName = a.doctor.user.name;
    return locale === 'ar'
      ? `موعد مع ${doctorName} (${specialty}) في ${formatWhen(a.scheduledAt, locale)}، ` +
          `${a.branch.name} — ${a.branch.address}. المدة ${a.durationMinutes} دقيقة، الحالة ${a.status}، السعر ${money}.`
      : `Appointment with ${doctorName} (${specialty}) at ${formatWhen(a.scheduledAt, locale)}, ` +
          `${a.branch.name} — ${a.branch.address}. ${a.durationMinutes} minutes, status ${a.status}, price ${money}.`;
  });
}

export async function askPatientAssistant(request: AssistantRequest): Promise<AssistantResponse> {
  const question = request.question.slice(0, MAX_QUESTION_CHARS);

  const verdict = await checkRateLimit('PATIENT_ASSISTANT', request.actorKey);
  if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfterSeconds);

  const startedAt = Date.now();
  const flags = detectRedFlags(question);
  const injection = looksLikeInjection(question);
  const context = await buildPatientContext(request.userId, request.locale);

  const assistant = getAiAssistant();
  let answer: string;
  let declined: boolean;
  let succeeded = true;

  try {
    const result = await assistant.answer({ question, locale: request.locale, context });
    answer = result.answer;
    declined = result.declined;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      // eslint-disable-next-line no-console
      console.error('[ai-assistant] Assistant failed:', err instanceof Error ? err.message : err);
    }
    answer =
      request.locale === 'ar'
        ? 'المساعد الآلي غير متاح حاليًا. يمكنك مراجعة مواعيدك من لوحة حسابك أو التواصل مع العيادة مباشرة.'
        : 'The assistant is unavailable right now. You can review your appointments on your dashboard or contact the clinic directly.';
    declined = false;
    succeeded = false;
  }

  await recordAiUsage({
    kind: 'PATIENT_ASSISTANT',
    actorKey: request.actorKey,
    provider: assistant.id,
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    userId: request.userId,
    inputChars: question.length,
    redFlagged: flags.urgent,
    injectionFlagged: injection,
    latencyMs: Date.now() - startedAt,
    succeeded,
  });

  return {
    answer,
    declined,
    urgent: flags.urgent,
    // The red-flag check runs on assistant questions too. Someone typing "I can't breathe,
    // should I move my appointment?" is describing an emergency inside a scheduling
    // question, and the scheduling answer is not the one that matters.
    ...(flags.urgent ? { emergencyGuidance: disclaimerFor(EMERGENCY_GUIDANCE, request.locale) } : {}),
    disclaimer: disclaimerFor(ASSISTANT_DISCLAIMER, request.locale),
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    provider: assistant.id,
  };
}

import { db } from '@/lib/db';
import { getAiAssistant } from '@/lib/ai';
import { AiUnavailableError, type SpecialtyOption, type TriageSuggestion } from '@/lib/ai/provider';
import {
  EMERGENCY_GUIDANCE,
  MEDICAL_DISCLAIMER_VERSION,
  TRIAGE_DISCLAIMER,
  disclaimerFor,
} from '@/lib/ai/disclaimers';
import { detectRedFlags, looksLikeInjection, MAX_SYMPTOM_CHARS } from '@/lib/ai/safety';
import { matchSpecialties } from '@/lib/ai/matcher';
import { checkRateLimit, recordAiUsage } from '@/lib/ai/usage';
import { searchDoctors } from '@/lib/services/marketplace';

/**
 * Symptom triage — the patient-facing AI feature (brief §19: "AI-assisted doctor discovery
 * based on symptoms").
 *
 * The shape of this service is the whole safety argument, so it is worth stating plainly:
 *
 * - **The model never chooses a doctor.** It ranks *specialties* from a closed list. Real
 *   doctors are then resolved by the ordinary marketplace query, which already restricts
 *   to `verified: true` doctors at `ACTIVE` tenants. So AI discovery cannot surface an
 *   unverified doctor, a suspended clinic, or a doctor that does not exist.
 * - **Emergencies do not depend on the model.** `detectRedFlags` runs in code, before the
 *   provider call, and its verdict is OR-ed with the model's. When it fires, the response
 *   leads with emergency guidance and suppresses "book an appointment" entirely — the one
 *   case where the product's own conversion goal is the wrong thing to optimize.
 * - **Every response carries its disclaimer**, attached here rather than in the route or
 *   the page, so no caller can render suggestions without it.
 * - **Rate limiting and usage recording happen here**, not in the route, for the same
 *   reason: a future second caller cannot forget them.
 */

export interface TriageRequest {
  symptomText: string;
  locale: 'ar' | 'en';
  /** Hashed rate-limit subject — see `actorKeyForIp`/`actorKeyForUser`. */
  actorKey: string;
  userId?: string | null;
  /** Optional city filter carried through to the doctor results. */
  cityId?: string;
}

export interface TriageSpecialtyResult {
  specialty: { id: string; slug: string; name: string; nameAr: string };
  confidence: number;
  reason: string;
  doctors: Awaited<ReturnType<typeof searchDoctors>>['items'];
}

export interface TriageResponse {
  urgent: boolean;
  /** Emergency text, present only when `urgent`. */
  emergencyGuidance?: string;
  summary: string;
  results: TriageSpecialtyResult[];
  disclaimer: string;
  disclaimerVersion: string;
  /** Which adapter served this — surfaced so the UI can be honest about what ran. */
  provider: string;
  /** True when the provider failed and deterministic matching served the response. */
  degraded: boolean;
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('AI rate limit exceeded.');
    this.name = 'RateLimitedError';
  }
}

/** Doctors shown per suggested specialty. Small on purpose — this is a shortlist, not a search results page. */
const DOCTORS_PER_SPECIALTY = 3;

export async function runSymptomTriage(request: TriageRequest): Promise<TriageResponse> {
  const symptomText = request.symptomText.slice(0, MAX_SYMPTOM_CHARS);

  const verdict = await checkRateLimit('SYMPTOM_TRIAGE', request.actorKey);
  if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfterSeconds);

  const startedAt = Date.now();
  const flags = detectRedFlags(symptomText);
  const injection = looksLikeInjection(symptomText);

  const specialties = await db.specialty.findMany({ orderBy: { name: 'asc' } });
  const options: SpecialtyOption[] = specialties.map((s) => ({
    slug: s.slug,
    name: s.name,
    nameAr: s.nameAr,
  }));

  const assistant = getAiAssistant();
  let suggestions: TriageSuggestion[];
  let summary: string;
  let urgent = flags.urgent;
  let degraded = false;

  try {
    const result = await assistant.triage({ symptomText, locale: request.locale, options });
    suggestions = result.suggestions;
    summary = result.summary;
    urgent = urgent || result.urgent;
  } catch (err) {
    // Includes AiUnavailableError. Falling back to the deterministic matcher keeps the
    // feature usable during a vendor outage; `degraded` tells the UI to say so rather than
    // pass keyword matching off as the full experience.
    if (!(err instanceof AiUnavailableError)) {
      // eslint-disable-next-line no-console
      console.error('[ai-triage] Assistant failed:', err instanceof Error ? err.message : err);
    }
    suggestions = matchSpecialties(symptomText, options, request.locale);
    summary =
      request.locale === 'ar'
        ? 'طابقنا وصفك مع التخصصات المتاحة بناءً على الكلمات التي ذكرتها.'
        : 'We matched your description to available specialties based on the words you used.';
    degraded = true;
  }

  const bySlug = new Map(specialties.map((s) => [s.slug, s]));

  // When a red flag fired, suggestions are suppressed entirely. Showing a bookable
  // shortlist beside "go to an emergency department now" invites exactly the wrong choice,
  // and the friction of searching manually is the correct cost here.
  const results: TriageSpecialtyResult[] = urgent
    ? []
    : await Promise.all(
        suggestions
          .filter((s) => bySlug.has(s.specialtySlug))
          .map(async (s) => {
            const specialty = bySlug.get(s.specialtySlug)!;
            const { items } = await searchDoctors({
              specialtySlug: s.specialtySlug,
              ...(request.cityId ? { cityId: request.cityId } : {}),
              limit: DOCTORS_PER_SPECIALTY,
            });
            return {
              specialty: { id: specialty.id, slug: specialty.slug, name: specialty.name, nameAr: specialty.nameAr },
              confidence: s.confidence,
              reason: s.reason,
              doctors: items,
            };
          })
      );

  await recordAiUsage({
    kind: 'SYMPTOM_TRIAGE',
    actorKey: request.actorKey,
    provider: assistant.id,
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    userId: request.userId ?? null,
    inputChars: symptomText.length,
    suggestedSlugs: results.map((r) => r.specialty.slug),
    redFlagged: urgent,
    injectionFlagged: injection,
    latencyMs: Date.now() - startedAt,
    succeeded: !degraded,
  });

  return {
    urgent,
    ...(urgent ? { emergencyGuidance: disclaimerFor(EMERGENCY_GUIDANCE, request.locale) } : {}),
    summary,
    results,
    disclaimer: disclaimerFor(TRIAGE_DISCLAIMER, request.locale),
    disclaimerVersion: MEDICAL_DISCLAIMER_VERSION,
    provider: assistant.id,
    degraded,
  };
}

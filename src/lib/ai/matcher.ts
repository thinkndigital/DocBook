import { SYMPTOM_LEXICON } from '@/lib/ai/lexicon';
import { normalize } from '@/lib/ai/safety';
import type { SpecialtyOption, TriageSuggestion } from '@/lib/ai/provider';

/**
 * Deterministic keyword matcher over the supplied specialty options.
 *
 * Serves two roles:
 * - The whole of `RuleBasedAssistant` (no API key, no network, no vendor).
 * - A cross-check for the Claude adapter: a model suggestion the lexicon also supports is
 *   ranked above one it doesn't. This is cheap grounding — it doesn't stop the model from
 *   being wrong, but it stops a confidently-wrong suggestion from outranking an obviously
 *   supported one.
 *
 * Scoring is intentionally simple and explainable (hit count, longest-phrase-wins for the
 * reason string). A learned ranker would be better, and is not something to build without
 * real traffic to train on — an unexplainable score in a healthcare product is worse than
 * a simple one, because nobody can say why a patient was routed to Orthopedics.
 */

interface Scored {
  option: SpecialtyOption;
  hits: string[];
}

function entryFor(option: SpecialtyOption) {
  return SYMPTOM_LEXICON.find(
    (entry) =>
      entry.slugPattern.test(option.slug) ||
      entry.slugPattern.test(option.name) ||
      entry.slugPattern.test(option.nameAr)
  );
}

function scoreOption(option: SpecialtyOption, haystack: string): Scored | null {
  const entry = entryFor(option);
  if (!entry) return null;

  const hits = entry.keywords.filter((keyword) => haystack.includes(normalize(keyword)));
  return hits.length > 0 ? { option, hits } : null;
}

/** Picks the option that looks like the general/family-practice fallback, if one exists. */
export function findFallbackOption(options: SpecialtyOption[]): SpecialtyOption | undefined {
  const fallbackPattern = /general|family|internal|عام|باطن/i;
  return options.find(
    (o) => fallbackPattern.test(o.slug) || fallbackPattern.test(o.name) || fallbackPattern.test(o.nameAr)
  );
}

function reasonFor(scored: Scored, locale: 'ar' | 'en'): string {
  // Longest matching phrase is the most specific thing the patient actually said, so it
  // makes the most useful "because you mentioned X".
  const phrase = [...scored.hits].sort((a, b) => b.length - a.length)[0] ?? '';
  const specialty = locale === 'ar' ? scored.option.nameAr : scored.option.name;
  return locale === 'ar'
    ? `ذكرت "${phrase}"، وهو ما يتابعه عادةً تخصص ${specialty}.`
    : `You mentioned "${phrase}", which ${specialty} usually handles.`;
}

export function matchSpecialties(
  symptomText: string,
  options: SpecialtyOption[],
  locale: 'ar' | 'en',
  limit = 3
): TriageSuggestion[] {
  const haystack = normalize(symptomText);

  const scored = options
    .map((option) => scoreOption(option, haystack))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.hits.length - a.hits.length);

  if (scored.length === 0) {
    const fallback = findFallbackOption(options);
    if (!fallback) return [];
    return [
      {
        specialtySlug: fallback.slug,
        // Low, and honestly so: this is "we could not tell", not "we are 40% sure".
        confidence: 0.3,
        reason:
          locale === 'ar'
            ? 'لم نتمكن من تحديد تخصص بعينه من وصفك. طبيب عام هو نقطة البداية المعتادة، ويحوّلك عند الحاجة.'
            : 'We could not map your description to a specific specialty. A general practitioner is the usual starting point and can refer you onward.',
      },
    ];
  }

  const topHits = scored[0]!.hits.length;
  return scored.slice(0, limit).map((s) => ({
    specialtySlug: s.option.slug,
    // Normalized against the best match so the top result reads as the strongest, capped
    // below 1.0 — nothing here justifies presenting certainty to a patient.
    confidence: Math.min(0.9, 0.4 + 0.5 * (s.hits.length / topHits)),
    reason: reasonFor(s, locale),
  }));
}

/** Slugs the lexicon independently supports — used to cross-check model output. */
export function keywordSupportedSlugs(symptomText: string, options: SpecialtyOption[]): Set<string> {
  const haystack = normalize(symptomText);
  return new Set(
    options.filter((option) => scoreOption(option, haystack) !== null).map((option) => option.slug)
  );
}

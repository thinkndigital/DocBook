/**
 * Safety layer for everything the AI touches.
 *
 * Four independent jobs, in the order the data flows:
 *
 * 1. **Red-flag detection** (`detectRedFlags`) — deterministic, runs in code, *before and
 *    independently of* any model call. This is the one part of the AI feature set that
 *    must not depend on a third-party API being up, in budget, or in a good mood. If the
 *    Anthropic API is down, the symptom checker still tells someone describing crushing
 *    chest pain to go to an emergency department.
 * 2. **Redaction** (`redactForModel`) — strips identifiers out of free text before it
 *    leaves the platform. The model does not need a phone number or a national ID to map
 *    "burning when I urinate" to Urology.
 * 3. **Injection detection** (`looksLikeInjection`) — flags attempts to talk to the model
 *    rather than to the product. This is *observability*, not the defense: the actual
 *    defense is that triage output is validated against a closed list of Specialty slugs,
 *    so a successful injection still cannot produce a doctor, price, or specialty that
 *    isn't in our database.
 * 4. **Output guarding** (`stripDiagnosticLanguage`) — a last check that a model answer
 *    isn't phrased as a diagnosis.
 *
 * ## The false-positive trade-off, stated explicitly
 *
 * `detectRedFlags` is tuned to over-trigger. Someone with mild, long-standing chest
 * discomfort will be told to seek emergency care, which costs them an unnecessary trip.
 * The opposite error — a missed myocardial infarction routed to a routine cardiology
 * booking three weeks out — is not recoverable. Every threshold here is set on that
 * asymmetry, deliberately, and should stay that way unless a clinician reviews it.
 */

export type RedFlagCategory =
  | 'CARDIAC'
  | 'RESPIRATORY'
  | 'STROKE'
  | 'BLEEDING'
  | 'CONSCIOUSNESS'
  | 'SEIZURE'
  | 'ANAPHYLAXIS'
  | 'POISONING'
  | 'TRAUMA'
  | 'OBSTETRIC'
  | 'SELF_HARM';

/**
 * Phrase lists per category, Arabic and English. Matching is substring-based on
 * normalized text (see `normalize`), which is why entries are phrases rather than single
 * words — "pain" alone would fire on everything, "chest pain" is a signal.
 *
 * Arabic normalization strips diacritics and unifies alef/ya/ta-marbuta forms, so a single
 * spelling per phrase covers the common variants users actually type.
 */
const RED_FLAGS: Record<RedFlagCategory, string[]> = {
  CARDIAC: [
    'chest pain',
    'chest pressure',
    'chest tightness',
    'crushing chest',
    'pain in my chest',
    'pain radiating to my arm',
    'heart attack',
    'الم في الصدر',
    'الم بالصدر',
    'وجع في الصدر',
    'وجع بالصدر',
    'ضغط على الصدر',
    'ضيق في الصدر',
    'ذبحه صدريه',
    'جلطه قلبيه',
    'نوبه قلبيه',
  ],
  RESPIRATORY: [
    'cannot breathe',
    'can not breathe',
    'cant breathe',
    'trouble breathing',
    'difficulty breathing',
    'struggling to breathe',
    'severe shortness of breath',
    'gasping',
    'choking',
    'turning blue',
    'ضيق تنفس',
    'ضيق في التنفس',
    'صعوبه في التنفس',
    'صعوبه بالتنفس',
    'لا استطيع التنفس',
    'اختناق',
    'زرقه',
  ],
  STROKE: [
    'stroke',
    'face drooping',
    'slurred speech',
    'cannot speak',
    'sudden numbness',
    'weakness on one side',
    'one side of my body',
    'sudden confusion',
    'worst headache of my life',
    'جلطه دماغيه',
    'سكته دماغيه',
    'تنميل مفاجئ',
    'شلل',
    'ميلان في الوجه',
    'تلعثم مفاجئ',
    'ضعف في نصف الجسم',
    'اسوا صداع في حياتي',
  ],
  BLEEDING: [
    'heavy bleeding',
    'bleeding heavily',
    'uncontrolled bleeding',
    'wont stop bleeding',
    'will not stop bleeding',
    'coughing blood',
    'coughing up blood',
    'vomiting blood',
    'blood in my vomit',
    'نزيف شديد',
    'نزيف حاد',
    'نزيف لا يتوقف',
    'تقيو دم',
    'سعال مصحوب بدم',
    'دم مع القي',
  ],
  CONSCIOUSNESS: [
    'unconscious',
    'unresponsive',
    'passed out',
    'fainted and did not wake',
    'not waking up',
    'فقدان الوعي',
    'فقد الوعي',
    'غيبوبه',
    'لا يستجيب',
    'اغماء متكرر',
  ],
  SEIZURE: ['seizure', 'convulsion', 'convulsing', 'fitting', 'تشنجات', 'تشنج', 'نوبه صرع', 'اختلاجات'],
  ANAPHYLAXIS: [
    'anaphylaxis',
    'anaphylactic',
    'throat closing',
    'throat swelling',
    'swollen throat',
    'swollen tongue',
    'severe allergic reaction',
    'حساسيه شديده',
    'تورم في الحلق',
    'تورم اللسان',
    'انتفاخ الحلق',
    'صدمه تحسسيه',
  ],
  POISONING: [
    'poisoning',
    'poisoned',
    'overdose',
    'took too many pills',
    'swallowed bleach',
    'swallowed chemical',
    'تسمم',
    'جرعه زائده',
    'ابتلع مواد كيماويه',
    'شرب مبيد',
  ],
  TRAUMA: [
    'head injury',
    'hit my head',
    'severe burn',
    'deep wound',
    'bone sticking out',
    'car accident',
    'اصابه في الراس',
    'ضربه على الراس',
    'حروق شديده',
    'جرح عميق',
    'كسر واضح',
    'حادث سير',
  ],
  OBSTETRIC: [
    'pregnant and bleeding',
    'bleeding while pregnant',
    'water broke',
    'baby not moving',
    'severe abdominal pain pregnant',
    'حامل ونزيف',
    'نزيف اثناء الحمل',
    'نزل ماء الجنين',
    'الجنين لا يتحرك',
  ],
  SELF_HARM: [
    'kill myself',
    'killing myself',
    'end my life',
    'suicide',
    'suicidal',
    'hurt myself',
    'self harm',
    'انتحار',
    'اقتل نفسي',
    'انهي حياتي',
    'ايذاء نفسي',
  ],
};

/**
 * Normalizes text for matching: lowercase, strip Arabic diacritics and tatweel, unify the
 * alef/ya/ta-marbuta variants users type interchangeably, and collapse punctuation and
 * whitespace. Without this, "ألم في الصدر" and "الم فى الصدر" are different strings and
 * only one of them fires.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Strip EVERY Unicode combining mark, not a hand-picked range.
    //
    // This was two explicit ranges (Arabic harakat U+064B–U+0652 and Latin combining marks
    // U+0300–U+036F) and it was wrong in a way that mattered: NFKD decomposes أ (U+0623)
    // into ا + COMBINING HAMZA ABOVE (U+0654), which sat in neither range. The leftover
    // hamza then hit the punctuation rule below and became a *space*, so "ألم في الصدر"
    // normalised to "ا لم في الصدر" and never matched the chest-pain red flag. Phase 10's
    // manual check passed only because the same sentence also contained ضيق في التنفس,
    // which matched a different category — the emergency path looked healthy while its
    // most important Arabic phrase was dead. \p{M} covers marks in every script, including
    // the ones the next language added to this product will bring.
    .replace(/\p{M}/gu, '')
    // Tatweel is a formatting elongation, not a mark, so it needs its own removal.
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RedFlagResult {
  urgent: boolean;
  categories: RedFlagCategory[];
}

export function detectRedFlags(text: string): RedFlagResult {
  const haystack = normalize(text);
  const categories: RedFlagCategory[] = [];

  for (const [category, phrases] of Object.entries(RED_FLAGS) as [RedFlagCategory, string[]][]) {
    if (phrases.some((phrase) => haystack.includes(normalize(phrase)))) {
      categories.push(category);
    }
  }

  return { urgent: categories.length > 0, categories };
}

/** Hard cap on symptom text. Long enough for a real description, short enough to bound cost. */
export const MAX_SYMPTOM_CHARS = 1500;
export const MAX_QUESTION_CHARS = 600;

/**
 * Removes direct identifiers before text is sent to a third-party model. Not a
 * general-purpose de-identifier — someone determined to type their own name into a symptom
 * box still can — but it removes the mechanical identifiers (phone, email, national id,
 * long digit runs) that show up in practice when a user pastes a message thread.
 */
export function redactForModel(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[redacted-email]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[redacted-number]')
    .replace(/\b\d{6,}\b/g, '[redacted-number]')
    .slice(0, MAX_SYMPTOM_CHARS);
}

const INJECTION_MARKERS = [
  'ignore previous',
  'ignore all previous',
  'ignore the above',
  'disregard previous',
  'system prompt',
  'you are now',
  'act as',
  'pretend to be',
  'reveal your instructions',
  'تجاهل التعليمات',
  'تجاهل ما سبق',
  'انت الان',
  'تصرف كانك',
];

/**
 * Flags likely prompt-injection attempts for audit. Deliberately does NOT block the
 * request: false positives here would refuse service to people describing real symptoms,
 * and blocking is not what makes the feature safe. What makes it safe is that triage
 * output is filtered against a closed list of Specialty slugs, and the assistant's context
 * contains no clinical data to exfiltrate in the first place.
 */
export function looksLikeInjection(text: string): boolean {
  const haystack = normalize(text);
  return INJECTION_MARKERS.some((marker) => haystack.includes(normalize(marker)));
}

const DIAGNOSTIC_PATTERNS = [
  /\byou (?:have|are suffering from|are diagnosed with)\b/i,
  /\bthis is (?:definitely|certainly) [a-z]/i,
  /\byou should take \d/i,
  // No \b before "mg": dosages are written "400mg" as often as "400 mg", and a word
  // boundary between a digit and a letter does not exist.
  /\d\s*mg\b/i,
  /\bmg\b\s*(?:of|per|daily|twice)/i,
  /انت مصاب ب/,
  /تشخيصك هو/,
  /خذ حبه/,
  /تناول دواء/,
];

/**
 * Last-line output guard. If a model answer slips into diagnosing or dosing despite the
 * system prompt, we drop the answer rather than paraphrase it — a partially rewritten
 * medical claim is worse than no answer, because it reads as sanctioned.
 */
export function containsDiagnosticLanguage(text: string): boolean {
  return DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(text));
}

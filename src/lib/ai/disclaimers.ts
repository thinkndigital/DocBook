/**
 * Medical disclaimers (brief §19: "Add medical disclaimers where required").
 *
 * These are a product commitment, not decoration. Three rules hold everywhere AI output
 * is rendered:
 *
 * - The disclaimer is attached by the *service layer*, in the same object as the AI
 *   output, so a route or page cannot render a suggestion without it. It is not something
 *   a UI author has to remember to add.
 * - It is not dismissible in the UI, and it does not scroll away from the suggestions.
 * - It is versioned. When the wording changes, `MEDICAL_DISCLAIMER_VERSION` changes with
 *   it, and every `AiInteraction` row records which version the user was shown — so
 *   "what were patients told at the time" is answerable from the ledger rather than from
 *   git archaeology.
 */

export const MEDICAL_DISCLAIMER_VERSION = 'v1-2026-08';

export interface Disclaimer {
  version: string;
  ar: string;
  en: string;
}

/** Shown with symptom-triage results. */
export const TRIAGE_DISCLAIMER: Disclaimer = {
  version: MEDICAL_DISCLAIMER_VERSION,
  ar:
    'هذه الاقتراحات لمساعدتك في اختيار التخصص المناسب فقط، وهي ليست تشخيصًا طبيًا ولا بديلًا عن ' +
    'استشارة طبيب مختص. لا تعتمد عليها لتأجيل رعاية طبية أو لتغيير علاج موصوف لك. إذا كانت أعراضك ' +
    'شديدة أو مفاجئة، توجّه إلى أقرب قسم طوارئ فورًا.',
  en:
    'These suggestions only help you choose which specialty to book. They are not a medical ' +
    'diagnosis and not a substitute for seeing a qualified doctor. Do not rely on them to delay ' +
    'care or change a prescribed treatment. If your symptoms are severe or sudden, go to the ' +
    'nearest emergency department immediately.',
};

/** Shown with patient-assistant answers. */
export const ASSISTANT_DISCLAIMER: Disclaimer = {
  version: MEDICAL_DISCLAIMER_VERSION,
  ar:
    'هذا مساعد آلي يجيب عن أسئلة الحجز والخدمة فقط. لا يقدّم تشخيصًا ولا وصفات ولا نصائح علاجية. ' +
    'لأي سؤال طبي، تحدّث مع طبيبك.',
  en:
    'This is an automated assistant for booking and service questions only. It does not diagnose, ' +
    'prescribe, or give treatment advice. For any medical question, speak to your doctor.',
};

/** Shown with clinic-side AI narrative and no-show risk. */
export const OPERATIONAL_DISCLAIMER: Disclaimer = {
  version: MEDICAL_DISCLAIMER_VERSION,
  ar:
    'ملخص تشغيلي مولّد آليًا من بيانات مواعيدك. لا يتضمن أي معلومات سريرية، ولا يصلح لاتخاذ قرار ' +
    'طبي. راجع الأرقام الأصلية قبل أي إجراء.',
  en:
    'An automatically generated operational summary of your appointment data. It contains no ' +
    'clinical information and must not drive a medical decision. Check the underlying numbers ' +
    'before acting.',
};

/**
 * Emergency guidance, shown *instead of* specialty suggestions when a red flag fires.
 *
 * Deliberately does not name a single national emergency number: the platform is
 * multi-country by design (brief §26/§27) and hard-coding "911" or "911-equivalent" would
 * be wrong the moment a second country is onboarded. The per-country number belongs on the
 * `Country` row — see `emergencyNumberFor` below.
 */
export const EMERGENCY_GUIDANCE: Disclaimer = {
  version: MEDICAL_DISCLAIMER_VERSION,
  ar:
    'الأعراض التي وصفتها قد تكون علامة على حالة طارئة. لا تحجز موعدًا وتنتظر — توجّه إلى أقرب قسم ' +
    'طوارئ الآن أو اتصل بخدمات الإسعاف.',
  en:
    'What you described may be a sign of an emergency. Do not book an appointment and wait — go ' +
    'to the nearest emergency department now or call emergency services.',
};

export function disclaimerFor(disclaimer: Disclaimer, locale: 'ar' | 'en'): string {
  return locale === 'ar' ? disclaimer.ar : disclaimer.en;
}

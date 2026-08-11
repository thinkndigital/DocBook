/**
 * Vendor-agnostic AI contract (brief §19 + §48 — AI must be swappable, not welded to one
 * model vendor).
 *
 * Two deliberate shape decisions, both about keeping the model on a short leash:
 *
 * 1. **Every method is a constrained task, not a chat passthrough.** There is no
 *    `complete(prompt)` on this interface. A generic completion method would make it
 *    trivial for a future route to send arbitrary patient text to a third-party model, and
 *    there would be no single place to enforce grounding or disclaimers. Each method here
 *    has a typed input and a typed output that the service layer can validate.
 *
 * 2. **Triage returns specialty *slugs*, never prose recommendations.** The model picks
 *    from a closed list of Specialty rows we hand it; the service layer then rejects any
 *    slug that isn't in that list and resolves real doctors from the database. The model
 *    therefore cannot invent a specialty, a doctor, a clinic, or a price — the classic
 *    hallucination failure mode in healthcare search is structurally unavailable to it.
 *
 * What is deliberately NOT on this interface: anything that diagnoses, prescribes, orders
 * tests, or interprets results. See `src/lib/ai/disclaimers.ts` for the boundary we commit
 * to in the product, and SECURITY.md for what is allowed to leave the platform.
 */

/** A specialty the model is allowed to choose from. Ids are never sent to the model — slugs are. */
export interface SpecialtyOption {
  slug: string;
  name: string;
  nameAr: string;
}

export interface TriageInput {
  /** Free text the patient typed. Treated as untrusted (see safety.ts). */
  symptomText: string;
  locale: 'ar' | 'en';
  /** Closed list the model must choose from. */
  options: SpecialtyOption[];
}

export interface TriageSuggestion {
  /** MUST be one of the input option slugs. The service layer drops anything else. */
  specialtySlug: string;
  /** 0–1. Used for ordering only, never shown as a medical probability. */
  confidence: number;
  /** One short sentence, in the requested locale, on why this specialty fits. */
  reason: string;
}

export interface TriageResult {
  suggestions: TriageSuggestion[];
  /**
   * True when the described symptoms warrant emergency care rather than an appointment.
   * The service layer also runs its own deterministic red-flag check and ORs the two —
   * an urgent-care recommendation must never depend solely on a model call succeeding.
   */
  urgent: boolean;
  /** Plain-language, non-diagnostic framing of what was understood. */
  summary: string;
}

export interface AssistantQuestion {
  question: string;
  locale: 'ar' | 'en';
  /**
   * Non-clinical, platform-scoped facts the assistant may use to answer: the patient's own
   * upcoming appointment times, doctor names, branch addresses. Never diagnoses, notes,
   * prescriptions, or attachments — see `buildPatientContext` in the triage service.
   */
  context: string[];
}

export interface AssistantAnswer {
  answer: string;
  /** True when the question asked for medical advice and the assistant declined to give it. */
  declined: boolean;
}

export interface BriefingMetric {
  label: string;
  labelAr: string;
  value: string;
}

export interface BriefingInput {
  locale: 'ar' | 'en';
  /** Pre-computed operational numbers. The model writes prose over these; it never queries. */
  metrics: BriefingMetric[];
  /** Short operational observations already derived in code, e.g. "3 unpaid appointments". */
  observations: string[];
}

export interface BriefingResult {
  /** 2–4 sentences of operational narrative. Contains no clinical content by construction. */
  narrative: string;
}

export interface AiAssistant {
  readonly id: string;
  /** Symptom text -> ranked specialties drawn only from the supplied closed list. */
  triage(input: TriageInput): Promise<TriageResult>;
  /** Bounded patient Q&A about their own bookings and how the platform works. */
  answer(input: AssistantQuestion): Promise<AssistantAnswer>;
  /** Operational narrative over numbers computed in `src/lib/services/clinic-briefing.ts`. */
  briefing(input: BriefingInput): Promise<BriefingResult>;
}

/** Thrown when the provider is unreachable or returns something unusable. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

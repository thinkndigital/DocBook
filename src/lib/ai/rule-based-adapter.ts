import type {
  AiAssistant,
  AssistantAnswer,
  AssistantQuestion,
  BriefingInput,
  BriefingResult,
  TriageInput,
  TriageResult,
} from '@/lib/ai/provider';
import { matchSpecialties } from '@/lib/ai/matcher';
import { detectRedFlags } from '@/lib/ai/safety';

/**
 * The no-API-key adapter — and deliberately NOT a stub (brief §47: no placeholder
 * product).
 *
 * Everything here does real work against real data:
 * - `triage` runs the bilingual lexicon matcher over the tenant's actual Specialty rows.
 *   A patient typing "وجع ضرس" gets Dentistry, and the doctors that come back are real
 *   verified doctors from the database.
 * - `answer` answers from the patient's own real appointment context, which the service
 *   layer assembles from their bookings — it does not invent times or doctor names.
 * - `briefing` renders the operational numbers the service layer already computed.
 *
 * The honest limitation, stated rather than hidden: this adapter does not *understand*
 * language. A symptom described entirely in words outside the lexicon falls back to
 * general practice with a low confidence and says so. It is a competent keyword triage,
 * not a language model, and it never pretends otherwise in its output.
 *
 * This is also why it stays the default when `AI_PROVIDER` is unset: a deployment with no
 * Anthropic key gets a working symptom checker, not a dead button.
 */
export class RuleBasedAssistant implements AiAssistant {
  readonly id = 'rule-based';

  async triage(input: TriageInput): Promise<TriageResult> {
    const flags = detectRedFlags(input.symptomText);
    const suggestions = matchSpecialties(input.symptomText, input.options, input.locale);

    return {
      suggestions,
      urgent: flags.urgent,
      summary:
        input.locale === 'ar'
          ? 'طابقنا وصفك مع التخصصات المتاحة بناءً على الكلمات التي ذكرتها.'
          : 'We matched your description to available specialties based on the words you used.',
    };
  }

  async answer(input: AssistantQuestion): Promise<AssistantAnswer> {
    if (input.context.length === 0) {
      return {
        answer:
          input.locale === 'ar'
            ? 'لا توجد لديك مواعيد قادمة مسجّلة. يمكنك البحث عن طبيب وحجز موعد من صفحة البحث.'
            : 'You have no upcoming appointments on record. You can search for a doctor and book from the search page.',
        declined: false,
      };
    }

    // Without a language model there is no honest way to answer an arbitrary question, so
    // this returns the patient's own facts and says that plainly rather than guessing at
    // intent and risking a confidently wrong answer about a real appointment.
    const heading =
      input.locale === 'ar'
        ? 'إليك ما هو مسجّل على حسابك حاليًا:'
        : "Here's what is currently on your account:";
    return {
      answer: `${heading}\n- ${input.context.join('\n- ')}`,
      declined: false,
    };
  }

  async briefing(input: BriefingInput): Promise<BriefingResult> {
    const lines = input.metrics.map(
      (m) => `${input.locale === 'ar' ? m.labelAr : m.label}: ${m.value}`
    );
    return { narrative: [...lines, ...input.observations].join('\n') };
  }
}

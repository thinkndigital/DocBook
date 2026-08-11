import type { AiAssistant } from '@/lib/ai/provider';
import { RuleBasedAssistant } from '@/lib/ai/rule-based-adapter';
import { ClaudeAssistant } from '@/lib/ai/claude-adapter';

let cached: AiAssistant | undefined;

/**
 * Resolves the configured assistant.
 *
 * Note the difference from `getPaymentProvider()`, which refuses to run its dev adapter in
 * production. The rule-based assistant is not a simulation of a real one — it does real
 * keyword triage against real specialties — so it is a legitimate production choice for a
 * deployment that would rather not send symptom text to a third party at all. Health data
 * residency rules in some of the GCC markets this platform targets make that a real
 * requirement, not a hypothetical.
 *
 * `AI_PROVIDER=claude` with no key is still an error: that is a misconfiguration, and
 * silently downgrading to keyword matching would hide it.
 */
export function getAiAssistant(): AiAssistant {
  if (cached) return cached;

  const configured = process.env.AI_PROVIDER ?? 'rule-based';

  switch (configured) {
    case 'rule-based':
      cached = new RuleBasedAssistant();
      return cached;
    case 'claude': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('AI_PROVIDER=claude requires ANTHROPIC_API_KEY. Set it, or use AI_PROVIDER=rule-based.');
      }
      cached = new ClaudeAssistant(apiKey);
      return cached;
    }
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${configured}". Implement an AiAssistant adapter and register it here.`
      );
  }
}

/** Test/DI seam — lets a caller substitute an assistant without touching env. */
export function setAiAssistant(assistant: AiAssistant | undefined): void {
  cached = assistant;
}

export type { AiAssistant } from '@/lib/ai/provider';

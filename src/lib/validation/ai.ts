import { z } from 'zod';
import { MAX_QUESTION_CHARS, MAX_SYMPTOM_CHARS } from '@/lib/ai/safety';

const localeSchema = z.enum(['ar', 'en']).default('ar');

/**
 * Minimum lengths are a cost control, not a UX preference: a two-character symptom string
 * cannot produce a useful triage, and letting it through spends a provider call to say so.
 */
export const triageSchema = z.object({
  symptomText: z.string().trim().min(8).max(MAX_SYMPTOM_CHARS),
  locale: localeSchema,
  cityId: z.string().uuid().optional(),
});

export const assistantSchema = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_CHARS),
  locale: localeSchema,
});

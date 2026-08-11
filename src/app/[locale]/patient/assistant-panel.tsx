'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * Patient assistant panel on the dashboard.
 *
 * Scoped tightly on purpose: it is presented as a booking-and-service helper, not a
 * general chatbot, because presenting it as a general chatbot is what invites people to
 * ask it medical questions. The disclaimer that comes back with every answer is rendered
 * verbatim and cannot be dismissed, and a declined answer is shown with the same weight as
 * an accepted one rather than as an error.
 */

interface AssistantResponse {
  answer: string;
  declined: boolean;
  urgent: boolean;
  emergencyGuidance?: string;
  disclaimer: string;
}

const COPY = {
  ar: {
    title: 'مساعد الحجز',
    hint: 'اسأل عن مواعيدك أو عن كيفية استخدام المنصة. المساعد لا يقدّم استشارات طبية.',
    placeholder: 'مثال: متى موعدي القادم وأين؟',
    submit: 'اسأل',
    loading: 'جارٍ الإجابة...',
    failed: 'تعذّر الحصول على إجابة. حاول مرة أخرى.',
    rateLimited: 'عدد الأسئلة كبير. انتظر قليلًا ثم أعد المحاولة.',
    urgentTitle: 'قد تحتاج رعاية عاجلة',
  },
  en: {
    title: 'Booking assistant',
    hint: 'Ask about your appointments or how to use the platform. The assistant does not give medical advice.',
    placeholder: 'For example: when and where is my next appointment?',
    submit: 'Ask',
    loading: 'Answering...',
    failed: 'Could not get an answer. Please try again.',
    rateLimited: 'Too many questions. Please wait a moment and try again.',
    urgentTitle: 'You may need urgent care',
  },
} as const;

export function AssistantPanel({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AssistantResponse | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (question.trim().length < 3) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch('/api/v1/patient/ai/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, locale }),
      });
      if (res.status === 429) {
        setError(copy.rateLimited);
        return;
      }
      if (!res.ok) {
        setError(copy.failed);
        return;
      }
      const body = (await res.json()) as { data: AssistantResponse };
      setResponse(body.data);
    } catch {
      setError(copy.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold text-neutral-900">{copy.title}</h2>
      <p className="mt-1 text-xs text-neutral-500">{copy.hint}</p>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={copy.placeholder}
          maxLength={600}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? copy.loading : copy.submit}
        </button>
      </form>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {response && (
        <div className="mt-4 space-y-3">
          {response.urgent && response.emergencyGuidance && (
            <div className="rounded-md border-2 border-red-500 bg-red-50 p-4">
              <p className="font-bold text-red-800">{copy.urgentTitle}</p>
              <p className="mt-1 text-sm text-red-800">{response.emergencyGuidance}</p>
            </div>
          )}
          <p className="whitespace-pre-line rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-800">
            {response.answer}
          </p>
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {response.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
}

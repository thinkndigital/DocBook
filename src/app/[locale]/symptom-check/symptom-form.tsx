'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { Badge } from '@/components/ui/badge';
import { formatMinor } from '@/lib/money';

/**
 * Symptom checker UI.
 *
 * Two things here are not stylistic choices and should not be "cleaned up":
 *
 * - **The disclaimer renders before any result and is not dismissible.** It sits above the
 *   suggestions, in normal reading order, not behind a tooltip or an expander.
 * - **When the response is urgent, suggestions are not rendered at all** — the server
 *   already returns an empty result set in that case, and this component leads with the
 *   emergency panel. A "book an appointment" call to action next to "go to an emergency
 *   department" is the wrong thing to put in front of someone who is frightened.
 */

interface Doctor {
  id: string;
  verified: boolean;
  consultationPriceMinor: number;
  currency: string;
  user: { name: string; nameAr: string | null };
  specialty: { name: string; nameAr: string };
  branches: Array<{ branch: { city: { name: string; nameAr: string } } }>;
}

interface TriageResult {
  specialty: { id: string; slug: string; name: string; nameAr: string };
  confidence: number;
  reason: string;
  doctors: Doctor[];
}

interface TriageResponse {
  urgent: boolean;
  emergencyGuidance?: string;
  summary: string;
  results: TriageResult[];
  disclaimer: string;
  degraded: boolean;
}

export function SymptomForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [symptomText, setSymptomText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<TriageResponse | null>(null);

  const nameKey: 'name' | 'nameAr' = locale === 'ar' ? 'nameAr' : 'name';

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (symptomText.trim().length < 8) {
      setError(dict.symptomCheck.tooShort);
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/v1/public/ai/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symptomText, locale }),
      });
      if (res.status === 429) {
        setError(dict.symptomCheck.rateLimited);
        return;
      }
      if (!res.ok) {
        setError(dict.symptomCheck.failed);
        return;
      }
      const body = (await res.json()) as { data: TriageResponse };
      setResponse(body.data);
    } catch {
      setError(dict.symptomCheck.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{dict.symptomCheck.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">{dict.symptomCheck.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={symptomText}
          onChange={(e) => setSymptomText(e.target.value)}
          placeholder={dict.symptomCheck.placeholder}
          rows={4}
          maxLength={1500}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? dict.symptomCheck.thinking : dict.symptomCheck.submit}
        </button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {response && (
        <div className="space-y-5">
          {response.urgent && response.emergencyGuidance && (
            <div className="rounded-lg border-2 border-red-500 bg-red-50 p-5">
              <h2 className="text-lg font-bold text-red-800">{dict.symptomCheck.urgentTitle}</h2>
              <p className="mt-2 text-sm text-red-800">{response.emergencyGuidance}</p>
            </div>
          )}

          {/* Rendered for every response, urgent or not, and never collapsible. */}
          <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            {response.disclaimer}
          </p>

          {response.degraded && (
            <p className="text-xs text-neutral-500">{dict.symptomCheck.degradedNotice}</p>
          )}

          {!response.urgent && (
            <>
              <p className="text-sm text-neutral-700">{response.summary}</p>

              {response.results.length === 0 ? (
                <p className="text-neutral-500">{dict.symptomCheck.noResults}</p>
              ) : (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold text-neutral-900">{dict.symptomCheck.resultsTitle}</h2>
                  {response.results.map((result) => (
                    <section key={result.specialty.slug} className="rounded-lg border border-neutral-200 bg-white p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-neutral-900">{result.specialty[nameKey]}</h3>
                        <span className="text-xs text-neutral-500">
                          {dict.symptomCheck.confidence}: {Math.round(result.confidence * 100)}%
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-600">
                        <span className="font-medium">{dict.symptomCheck.whyThis}: </span>
                        {result.reason}
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {result.doctors.map((doctor) => (
                          <Link
                            key={doctor.id}
                            href={`/${locale}/doctors/${doctor.id}`}
                            className="rounded-md border border-neutral-200 p-3 hover:border-brand-400"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-neutral-900">
                                {doctor.user[nameKey] ?? doctor.user.name}
                              </span>
                              {doctor.verified && <Badge tone="success">{dict.doctors.verified}</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-neutral-500">
                              {doctor.branches.map((b) => b.branch.city[nameKey]).join('، ')}
                            </p>
                            <p className="mt-2 text-xs font-medium text-brand-700">
                              {formatMinor(doctor.consultationPriceMinor, doctor.currency)}
                            </p>
                          </Link>
                        ))}
                      </div>

                      <Link
                        href={`/${locale}/doctors?specialty=${result.specialty.slug}`}
                        className="mt-3 inline-block text-sm text-brand-700 hover:underline"
                      >
                        {dict.doctors.title} — {result.specialty[nameKey]}
                      </Link>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

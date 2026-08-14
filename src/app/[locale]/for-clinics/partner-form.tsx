'use client';

import { useState, type FormEvent } from 'react';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

interface Props {
  locale: Locale;
  dict: Dictionary;
  countries: Array<{ id: string; name: string; nameAr: string }>;
  cities: Array<{ id: string; name: string; nameAr: string; countryId: string }>;
}

export function PartnerForm({ locale, dict, countries, cities }: Props) {
  const nameKey: 'name' | 'nameAr' = locale === 'ar' ? 'nameAr' : 'name';
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only cities in the chosen country. The server drops a mismatched pair rather than
  // rejecting the enquiry, but offering an impossible combination in the first place is a
  // way to make someone doubt the form.
  const visibleCities = cities.filter((c) => c.countryId === countryId);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].filter(([, v]) => typeof v === 'string' && v !== '')
    );

    const res = await fetch('/api/v1/public/partner-applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);

    if (res.ok) {
      setDone(true);
      return;
    }
    setError(res.status === 429 ? dict.partner.rateLimited : dict.partner.error);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-bold text-neutral-900">{dict.partner.successTitle}</h2>
        <p className="mt-2 text-sm text-neutral-700">{dict.partner.successBody}</p>
      </div>
    );
  }

  const field = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';
  const label = 'mb-1 block text-sm text-neutral-700';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <label className={label} htmlFor="organizationName">{dict.partner.orgName}</label>
        <input id="organizationName" name="organizationName" required minLength={2} maxLength={160} className={field} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="type">{dict.partner.type}</label>
          <select id="type" name="type" className={field} defaultValue="CLINIC">
            <option value="CLINIC">{dict.partner.clinic}</option>
            <option value="HOSPITAL">{dict.partner.hospital}</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="doctorCount">{dict.partner.doctorCount}</label>
          <input id="doctorCount" name="doctorCount" type="number" min={0} max={10000} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="countryId">{dict.partner.country}</label>
          <select
            id="countryId"
            name="countryId"
            required
            className={field}
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c[nameKey]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="cityId">
            {dict.partner.city} <span className="text-neutral-400">({dict.partner.cityOptional})</span>
          </label>
          <select id="cityId" name="cityId" className={field} defaultValue="">
            <option value="">—</option>
            {visibleCities.map((c) => (
              <option key={c.id} value={c.id}>{c[nameKey]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="contactName">{dict.partner.contactName}</label>
        <input id="contactName" name="contactName" required minLength={2} maxLength={120} className={field} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="contactEmail">{dict.partner.contactEmail}</label>
          <input id="contactEmail" name="contactEmail" type="email" required className={field} />
        </div>
        <div>
          <label className={label} htmlFor="contactPhone">{dict.partner.contactPhone}</label>
          <input id="contactPhone" name="contactPhone" required minLength={6} maxLength={32} className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="notes">{dict.partner.notes}</label>
        <textarea id="notes" name="notes" rows={4} maxLength={2000} className={field} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || countries.length === 0}
        className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-neutral-300"
      >
        {submitting ? dict.partner.submitting : dict.partner.submit}
      </button>

      <p className="text-xs text-neutral-500">{dict.partner.privacyNote}</p>
    </form>
  );
}

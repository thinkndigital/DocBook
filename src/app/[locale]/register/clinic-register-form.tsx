'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  dict: Dictionary;
  nameKey: 'name' | 'nameAr';
  countries: Array<{ id: string; name: string; nameAr: string }>;
  cities: Array<{ id: string; name: string; nameAr: string; countryId: string }>;
  initialType?: 'HOSPITAL';
}

export function ClinicRegisterForm({ dict, nameKey, countries, cities, initialType }: Props) {
  const router = useRouter();
  const t = dict.registerRoles;
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const visibleCities = cities.filter((c) => c.countryId === countryId);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const adminEmail = String(form.get('adminEmail'));
    const password = String(form.get('password'));

    const payload = {
      type: form.get('type'),
      name: form.get('name'),
      nameAr: form.get('nameAr'),
      countryId,
      adminName: form.get('adminName'),
      adminEmail,
      password,
      branchName: form.get('branchName'),
      branchAddress: form.get('branchAddress'),
      cityId: form.get('cityId'),
      branchPhone: form.get('branchPhone') || undefined,
    };

    const res = await fetch('/api/v1/auth/register-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setSubmitting(false);
      if (res.status === 429) return setError(t.rateLimited);
      if (res.status === 409) return setError(t.emailTaken);
      return setError(t.error);
    }

    const result = await signIn('credentials', { email: adminEmail, password, redirect: false });
    setSubmitting(false);

    if (result?.error) {
      setError(dict.auth.invalidCredentials);
      return;
    }

    setDone(true);
    router.push('/tenant');
    router.refresh();
  }

  if (done) {
    return <p className="text-sm text-brand-700">{t.successClinic}</p>;
  }

  const field = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';
  const label = 'mb-1 block text-sm text-neutral-700';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="type">{t.clinicType}</label>
        <select id="type" name="type" className={field} defaultValue={initialType ?? 'CLINIC'}>
          <option value="CLINIC">{t.clinic}</option>
          <option value="MEDICAL_CENTER">{t.medicalCenter}</option>
          <option value="HOSPITAL">{t.hospital}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input name="name" placeholder={t.orgName} required minLength={2} maxLength={200} />
        <Input name="nameAr" placeholder={t.orgNameAr} required minLength={2} maxLength={200} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="countryId">{t.country}</label>
          <select
            id="countryId"
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
          <label className={label} htmlFor="cityId">{t.city}</label>
          <select id="cityId" name="cityId" required className={field} defaultValue="">
            <option value="" disabled>—</option>
            {visibleCities.map((c) => (
              <option key={c.id} value={c.id}>{c[nameKey]}</option>
            ))}
          </select>
        </div>
      </div>

      <Input name="branchName" placeholder={t.branchName} required minLength={2} maxLength={200} />
      <Input name="branchAddress" placeholder={t.branchAddress} required minLength={2} maxLength={300} />
      <Input name="branchPhone" placeholder={t.branchPhone} autoComplete="tel" />

      <div className="border-t border-neutral-200 pt-4">
        <Input name="adminName" placeholder={t.adminName} required minLength={2} maxLength={200} autoComplete="name" />
      </div>
      <Input name="adminEmail" type="email" placeholder={t.adminEmail} required autoComplete="email" />
      <Input name="password" type="password" placeholder={dict.auth.password} required minLength={8} maxLength={200} autoComplete="new-password" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting || countries.length === 0}>
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}

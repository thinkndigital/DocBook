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
}

export function SupplierRegisterForm({ dict, nameKey, countries }: Props) {
  const router = useRouter();
  const t = dict.registerRoles;
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));

    const res = await fetch('/api/v1/auth/register-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        nameAr: form.get('nameAr'),
        countryId,
        contactName: form.get('contactName'),
        email,
        phone: form.get('phone') || undefined,
        password,
      }),
    });

    if (!res.ok) {
      setSubmitting(false);
      if (res.status === 429) return setError(t.rateLimited);
      if (res.status === 409) return setError(t.emailTaken);
      return setError(t.error);
    }

    const result = await signIn('credentials', { email, password, redirect: false });
    setSubmitting(false);

    if (result?.error) {
      setError(dict.auth.invalidCredentials);
      return;
    }

    setDone(true);
    router.push('/supplier');
    router.refresh();
  }

  if (done) {
    return <p className="text-sm text-brand-700">{t.successSupplier}</p>;
  }

  const field = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';
  const label = 'mb-1 block text-sm text-neutral-700';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input name="name" placeholder={t.orgName} required minLength={2} maxLength={200} />
        <Input name="nameAr" placeholder={t.orgNameAr} required minLength={2} maxLength={200} />
      </div>
      <div>
        <label className={label} htmlFor="countryId">{t.country}</label>
        <select id="countryId" className={field} value={countryId} onChange={(e) => setCountryId(e.target.value)}>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c[nameKey]}</option>
          ))}
        </select>
      </div>
      <Input name="contactName" placeholder={t.contactPersonName} required minLength={2} maxLength={200} autoComplete="name" />
      <Input name="email" type="email" placeholder={dict.auth.email} required autoComplete="email" />
      <Input name="phone" placeholder={dict.auth.phone} autoComplete="tel" />
      <Input name="password" type="password" placeholder={dict.auth.password} required minLength={8} maxLength={200} autoComplete="new-password" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting || countries.length === 0}>
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}

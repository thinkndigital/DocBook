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
  specialties: Array<{ id: string; name: string; nameAr: string }>;
}

type ClinicMode = 'JOIN' | 'NEW';
type ResolvedTenant = { id: string; name: string; nameAr: string; branches: Array<{ id: string; name: string }> };

export function DoctorRegisterForm({ dict, nameKey, countries, cities, specialties }: Props) {
  const router = useRouter();
  const t = dict.registerRoles;
  const [mode, setMode] = useState<ClinicMode>('JOIN');

  const [inviteCode, setInviteCode] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedTenant | null>(null);
  const [branchId, setBranchId] = useState('');

  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const visibleCities = cities.filter((c) => c.countryId === countryId);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function checkInviteCode() {
    setCodeError(null);
    setResolved(null);
    setBranchId('');
    if (inviteCode.trim().length !== 8) {
      setCodeError(t.invalidCode);
      return;
    }
    setCheckingCode(true);
    const res = await fetch(`/api/v1/public/tenants/by-invite-code/${encodeURIComponent(inviteCode.trim())}`);
    setCheckingCode(false);
    if (!res.ok) {
      setCodeError(t.invalidCode);
      return;
    }
    const body = await res.json();
    const tenant = body.data as ResolvedTenant;
    setResolved(tenant);
    setBranchId(tenant.branches[0]?.id ?? '');
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (mode === 'JOIN' && (!resolved || !branchId)) {
      setError(t.invalidCode);
      return;
    }

    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    const languages = String(form.get('languages') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      email,
      password,
      name: form.get('name'),
      nameAr: form.get('nameAr') || undefined,
      specialtyId: form.get('specialtyId'),
      licenseNumber: form.get('licenseNumber'),
      yearsExperience: Number(form.get('yearsExperience') || 0),
      consultationPriceMinor: Math.round(Number(form.get('consultationPrice') || 0) * 100),
      bio: form.get('bio') || undefined,
      languages,
    };

    if (mode === 'JOIN') {
      payload.inviteCode = inviteCode.trim();
      payload.branchId = branchId;
    } else {
      payload.newClinic = {
        name: form.get('clinicName'),
        nameAr: form.get('clinicNameAr'),
        countryId,
        branchName: form.get('branchName'),
        branchAddress: form.get('branchAddress'),
        cityId: form.get('cityId'),
        branchPhone: form.get('branchPhone') || undefined,
      };
    }

    const res = await fetch('/api/v1/auth/register-doctor', {
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

    const result = await signIn('credentials', { email, password, redirect: false });
    setSubmitting(false);

    if (result?.error) {
      setError(dict.auth.invalidCredentials);
      return;
    }

    setDone(true);
    router.push('/doctor');
    router.refresh();
  }

  if (done) {
    return <p className="text-sm text-brand-700">{t.successDoctor}</p>;
  }

  const field = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';
  const label = 'mb-1 block text-sm text-neutral-700';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1">
        <button
          type="button"
          onClick={() => setMode('JOIN')}
          className={`flex-1 rounded px-3 py-2 text-sm ${mode === 'JOIN' ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-neutral-500'}`}
        >
          {t.joinExisting}
        </button>
        <button
          type="button"
          onClick={() => setMode('NEW')}
          className={`flex-1 rounded px-3 py-2 text-sm ${mode === 'NEW' ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-neutral-500'}`}
        >
          {t.createOwn}
        </button>
      </div>

      {mode === 'JOIN' ? (
        <div className="rounded-md border border-neutral-200 p-3">
          <label className={label} htmlFor="inviteCode">{t.inviteCode}</label>
          <p className="mb-2 text-xs text-neutral-500">{t.inviteCodeHint}</p>
          <div className="flex gap-2">
            <input
              id="inviteCode"
              className={field}
              value={inviteCode}
              maxLength={8}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase());
                setResolved(null);
              }}
            />
            <button
              type="button"
              onClick={checkInviteCode}
              disabled={checkingCode}
              className="shrink-0 rounded-md bg-neutral-800 px-4 text-sm text-white hover:bg-neutral-900 disabled:bg-neutral-300"
            >
              {checkingCode ? t.checkingCode : t.checkCode}
            </button>
          </div>
          {codeError && <p className="mt-2 text-sm text-red-600">{codeError}</p>}
          {resolved && (
            <div className="mt-3">
              <p className="text-sm text-neutral-700">
                {t.codeResolvedTo} <strong>{resolved[nameKey]}</strong>
              </p>
              <label className={`${label} mt-2`} htmlFor="branchId">{t.selectBranch}</label>
              <select id="branchId" className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {resolved.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-md border border-neutral-200 p-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input name="clinicName" placeholder={t.newClinicName} required minLength={2} maxLength={200} />
            <Input name="clinicNameAr" placeholder={t.newClinicNameAr} required minLength={2} maxLength={200} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="countryId">{t.country}</label>
              <select id="countryId" className={field} value={countryId} onChange={(e) => setCountryId(e.target.value)}>
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
        </div>
      )}

      <div className="border-t border-neutral-200 pt-4" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input name="name" placeholder={dict.auth.name} required minLength={2} maxLength={200} autoComplete="name" />
        <Input name="nameAr" placeholder={`${dict.auth.name} (عربي)`} maxLength={200} />
      </div>
      <Input name="email" type="email" placeholder={dict.auth.email} required autoComplete="email" />
      <Input name="password" type="password" placeholder={dict.auth.password} required minLength={8} maxLength={200} autoComplete="new-password" />

      <div>
        <label className={label} htmlFor="specialtyId">{t.specialty}</label>
        <select id="specialtyId" name="specialtyId" required className={field} defaultValue="">
          <option value="" disabled>—</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>{s[nameKey]}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input name="licenseNumber" placeholder={t.licenseNumber} required minLength={2} maxLength={100} />
        <Input name="yearsExperience" type="number" min={0} max={70} placeholder={t.yearsExperience} />
      </div>

      <Input name="consultationPrice" type="number" min={0} step="0.01" placeholder={t.consultationPrice} required />
      <Input name="languages" placeholder={t.languages} />
      <textarea name="bio" rows={3} maxLength={2000} placeholder={t.bio} className={field} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}

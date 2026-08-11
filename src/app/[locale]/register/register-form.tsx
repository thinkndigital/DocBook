'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export function RegisterForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));

    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: form.get('name'),
        phone: form.get('phone') || undefined,
      }),
    });

    if (!res.ok) {
      setSubmitting(false);
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? dict.auth.registrationFailed);
      return;
    }

    const result = await signIn('credentials', { email, password, redirect: false });
    setSubmitting(false);

    if (result?.error) {
      setError(dict.auth.invalidCredentials);
      return;
    }

    router.push(`/${locale}/patient`);
    router.refresh();
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">{dict.auth.registerTitle}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input name="name" placeholder={dict.auth.name} required autoComplete="name" />
        <Input name="email" type="email" placeholder={dict.auth.email} required autoComplete="email" />
        <Input name="phone" placeholder={dict.auth.phone} autoComplete="tel" />
        <Input name="password" type="password" placeholder={dict.auth.password} required minLength={8} autoComplete="new-password" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? dict.common.loading : dict.auth.registerCta}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        {dict.auth.alreadyHaveAccount}{' '}
        <a href={`/${locale}/login`} className="text-brand-700 hover:underline">
          {dict.auth.loginCta}
        </a>
      </p>
    </Card>
  );
}

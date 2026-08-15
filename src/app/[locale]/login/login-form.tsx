'use client';

import { useState, type FormEvent } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { postLoginDestination } from '@/lib/auth/post-login-destination';

export function MarketplaceLoginForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await signIn('credentials', {
      email: form.get('email'),
      password: form.get('password'),
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error) {
      setError(dict.auth.invalidCredentials);
      return;
    }

    // Staff sign in through this form too — the marketplace header is the only login link
    // most people ever see. Sending every role to the patient dashboard left a clinic admin
    // authenticated in the wrong portal with no way across.
    const session = await getSession();
    router.push(searchParams.get('callbackUrl') ?? postLoginDestination(session?.user?.role, locale));
    router.refresh();
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">{dict.auth.loginTitle}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input name="email" type="email" placeholder={dict.auth.email} required autoComplete="email" />
        <Input name="password" type="password" placeholder={dict.auth.password} required autoComplete="current-password" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? dict.common.loading : dict.auth.loginCta}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-600">
        {dict.auth.dontHaveAccount}{' '}
        <a href={`/${locale}/register`} className="text-brand-700 hover:underline">
          {dict.auth.registerCta}
        </a>
      </p>
      <p className="mt-2 text-center text-sm">
        <a href="/account/forgot-password" className="text-neutral-500 hover:underline">
          نسيت كلمة السر؟
        </a>
      </p>
    </Card>
  );
}

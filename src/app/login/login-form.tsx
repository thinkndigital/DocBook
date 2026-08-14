'use client';

import { useState, type FormEvent } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { postLoginDestination } from '@/lib/auth/post-login-destination';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setSubmitting(false);
      setError('بيانات الدخول غير صحيحة، أو الحساب موقوف.');
      return;
    }

    // getSession(), not useSession(): the hook's value is from before this sign-in, so
    // routing on it sends the user to whichever portal they were (not) in a moment ago.
    // An explicit callbackUrl still wins — that is what returns a patient to the doctor
    // profile they were booking when they were asked to sign in.
    const session = await getSession();
    setSubmitting(false);
    router.push(searchParams.get('callbackUrl') ?? postLoginDestination(session?.user?.role));
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">تسجيل الدخول</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-neutral-700" htmlFor="email">
            البريد الإلكتروني
          </label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-700" htmlFor="password">
            كلمة المرور
          </label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الدخول' : 'دخول'}
        </Button>
      </form>
    </Card>
  );
}

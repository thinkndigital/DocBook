'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Card } from '@/components/ui/card';

const MESSAGES: Record<string, string> = {
  INVALID_CURRENT_PASSWORD: 'كلمة السر الحالية غير صحيحة.',
  SAME_AS_ASSIGNED: 'هذه هي كلمة السر الافتراضية المعروفة. اختر غيرها.',
  SAME_AS_CURRENT: 'كلمة السر الجديدة مطابقة للحالية.',
};

export function PasswordForm({ required }: { required: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('الحقلان غير متطابقين.');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/v1/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(MESSAGES[body?.error?.code] ?? 'تعذّر تغيير كلمة السر. حاول مرة أخرى.');
      return;
    }

    // The mustChangePassword flag lives in the JWT, which was minted before this change.
    // Signing out and back in is the only way to get a token without it — refreshing the
    // page would loop straight back to this screen through the middleware guard.
    await signOut({ redirect: false });
    router.push('/login?changed=1');
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="mb-2 text-xl font-bold text-neutral-900">
        {required ? 'غيّر كلمة السر للمتابعة' : 'تغيير كلمة السر'}
      </h1>

      {required && (
        <p className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          حسابك أُنشئ بكلمة سر افتراضية يعرفها غيرك. اخترْ كلمة سر خاصة بك قبل الوصول إلى
          بقية المنصّة.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-neutral-700" htmlFor="current">
            كلمة السر الحالية
          </label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-neutral-700" htmlFor="next">
            كلمة السر الجديدة
          </label>
          <input
            id="next"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-neutral-700" htmlFor="confirm">
            تأكيد كلمة السر الجديدة
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-neutral-300"
        >
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </form>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Forgot password" resolved from the admin side, since no email channel is configured to
 * deliver a self-service reset link (see src/lib/services/password.ts). Two paths: type a
 * password to hand the user directly, or leave it blank to fall back to the default
 * assigned password with a forced change — same choice as creating the account.
 */
export function ResetPasswordButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: value || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError('تعذّرت إعادة التعيين.');
      return;
    }
    setDone(true);
    setTimeout(() => {
      setOpen(false);
      setDone(false);
      setValue('');
      router.refresh();
    }, 1200);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-xs text-neutral-500 underline hover:text-brand-700"
      >
        إعادة تعيين كلمة السر
      </button>
    );
  }

  if (done) {
    return <span className="text-xs text-brand-700">تم ✓</span>;
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="كلمة سر جديدة (اتركها فارغة للافتراضية)"
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="rounded-md bg-brand-600 px-2 py-1 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? '...' : 'تأكيد'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
        >
          إلغاء
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

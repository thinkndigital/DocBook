'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  bio: string;
  bioAr: string;
  consultationPriceJod: number;
  languages: string;
}

export function ProfileForm({ bio, bioAr, consultationPriceJod, languages }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/doctor/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bio: form.get('bio') || undefined,
        bioAr: form.get('bioAr') || undefined,
        consultationPriceMinor: Math.round(Number(form.get('consultationPrice')) * 100),
        languages: String(form.get('languages') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر حفظ التعديلات.');
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm text-neutral-700" htmlFor="bioAr">
          نبذة (عربي)
        </label>
        <textarea
          id="bioAr"
          name="bioAr"
          defaultValue={bioAr}
          rows={3}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-neutral-700" htmlFor="bio">
          نبذة (إنجليزي)
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={bio}
          rows={3}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-neutral-700" htmlFor="consultationPrice">
          سعر الاستشارة (JOD)
        </label>
        <Input id="consultationPrice" name="consultationPrice" type="number" step="0.01" min="0" defaultValue={consultationPriceJod} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-neutral-700" htmlFor="languages">
          اللغات (مفصولة بفاصلة)
        </label>
        <Input id="languages" name="languages" defaultValue={languages} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-700">تم الحفظ.</p>}
      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? '...جارٍ الحفظ' : 'حفظ'}
      </Button>
    </form>
  );
}

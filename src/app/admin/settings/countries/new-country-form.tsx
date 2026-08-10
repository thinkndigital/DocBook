'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewCountryForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/admin/countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.get('code'),
        name: form.get('name'),
        nameAr: form.get('nameAr'),
        currency: form.get('currency'),
        phonePrefix: form.get('phonePrefix'),
        timezone: form.get('timezone'),
        languages: String(form.get('languages') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة الدولة.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة دولة
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Input name="code" placeholder="رمز الدولة (JO)" required maxLength={2} />
      <Input name="name" placeholder="الاسم (إنجليزي)" required />
      <Input name="nameAr" placeholder="الاسم (عربي)" required />
      <Input name="currency" placeholder="العملة (JOD)" required maxLength={3} />
      <Input name="phonePrefix" placeholder="مفتاح الهاتف (+962)" required />
      <Input name="timezone" placeholder="المنطقة الزمنية (Asia/Amman)" required />
      <Input name="languages" placeholder="اللغات (ar,en)" required className="col-span-3" />
      {error && <p className="col-span-3 text-sm text-red-600">{error}</p>}
      <div className="col-span-3 flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الإضافة' : 'إضافة'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

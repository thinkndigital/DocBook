'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewServiceForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/tenant/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        nameAr: form.get('nameAr'),
        priceMinor: Math.round(Number(form.get('price')) * 100),
        durationMinutes: Number(form.get('durationMinutes')),
        type: form.get('type'),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة الخدمة.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة خدمة
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Input name="name" placeholder="اسم الخدمة (إنجليزي)" required />
      <Input name="nameAr" placeholder="اسم الخدمة (عربي)" required />
      <Input name="price" type="number" step="0.01" min="0" placeholder="السعر (JOD)" required />
      <Input name="durationMinutes" type="number" min="5" max="480" placeholder="المدة (دقيقة)" required />
      <select
        name="type"
        defaultValue="IN_PERSON"
        className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="IN_PERSON">حضوري</option>
        <option value="VIDEO">مكالمة فيديو (عن بعد)</option>
        <option value="FOLLOW_UP">متابعة</option>
        <option value="EMERGENCY">طارئ</option>
        <option value="HOME_VISIT">زيارة منزلية</option>
      </select>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-2 flex gap-2">
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

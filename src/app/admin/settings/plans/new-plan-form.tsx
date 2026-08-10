'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

export function NewPlanForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/admin/subscription-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: form.get('tier'),
        name: form.get('name'),
        priceMonthlyMinor: Math.round(Number(form.get('priceMonthly')) * 100),
        bookingCommissionPct: Number(form.get('bookingCommissionPct')),
        apiAccess: form.get('apiAccess') === 'on',
        whiteLabel: form.get('whiteLabel') === 'on',
        features: {},
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إنشاء الخطة.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة خطة
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Select name="tier" required defaultValue="">
        <option value="" disabled>
          الفئة
        </option>
        <option value="FREE">مجانية</option>
        <option value="PRO">احترافية</option>
        <option value="ENTERPRISE">مؤسسية</option>
      </Select>
      <Input name="name" placeholder="اسم الخطة" required />
      <Input name="priceMonthly" type="number" step="0.01" min="0" placeholder="السعر الشهري (JOD)" required />
      <Input
        name="bookingCommissionPct"
        type="number"
        step="0.1"
        min="0"
        max="100"
        placeholder="عمولة الحجز %"
        defaultValue="0"
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="apiAccess" /> وصول API
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="whiteLabel" /> علامة تجارية خاصة
      </label>
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الإنشاء' : 'إنشاء'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

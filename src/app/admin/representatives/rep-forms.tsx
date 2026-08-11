'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

export function NewRepForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const target = form.get('monthlyTarget');
    const res = await fetch('/api/v1/admin/representatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        name: form.get('name'),
        monthlyTargetAmount: target ? Math.round(Number(target) * 100) : undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إنشاء المندوب.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة مندوب
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Input name="name" placeholder="الاسم" required />
      <Input name="email" type="email" placeholder="البريد الإلكتروني" required />
      <Input name="monthlyTarget" type="number" step="0.01" min="0" placeholder="الهدف الشهري (JOD، اختياري)" />
      {error && <p className="col-span-3 text-sm text-red-600">{error}</p>}
      <div className="col-span-3 flex gap-2">
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

export function AssignTenantForm({
  repId,
  tenants,
}: {
  repId: string;
  tenants: Array<{ id: string; nameAr: string }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/admin/representatives/${repId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: form.get('tenantId') }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر الإسناد.');
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <Select name="tenantId" required defaultValue="" className="max-w-xs">
        <option value="" disabled>
          إسناد جهة صحية
        </option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nameAr}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={submitting}>
        {submitting ? '...' : 'إسناد'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

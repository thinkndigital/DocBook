'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

export function NewStaffForm({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/tenant/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        name: form.get('name'),
        title: form.get('title') || undefined,
        branchId: form.get('branchId') || undefined,
        initialPassword: form.get('initialPassword') || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة الموظف.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة موظف استقبال
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Input name="name" placeholder="الاسم" required />
      <Input name="email" type="email" placeholder="البريد الإلكتروني" required />
      <Input name="title" placeholder="المسمى الوظيفي" />
      <Select name="branchId" defaultValue="">
        <option value="">بدون فرع محدد</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <div className="col-span-2">
        <Input name="initialPassword" placeholder="كلمة سر أولية (اختياري)" />
        <p className="mt-1 text-xs text-neutral-500">
          اتركها فارغة لكلمة سر افتراضية يُطلب تغييرها عند أول دخول، أو اكتب كلمة سر وأعطها
          للموظف مباشرة.
        </p>
      </div>
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

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

const TENANT_TYPES = [
  ['INDEPENDENT_DOCTOR', 'طبيب مستقل'],
  ['CLINIC', 'عيادة'],
  ['MEDICAL_CENTER', 'مركز طبي'],
  ['HOSPITAL', 'مستشفى'],
  ['PHARMACY', 'صيدلية'],
  ['LABORATORY', 'مختبر'],
  ['HEALTHCARE_GROUP', 'مجموعة رعاية صحية'],
  ['CORPORATE', 'حساب شركات'],
  ['INSURANCE_COMPANY', 'شركة تأمين'],
] as const;

export function NewTenantForm({ countries }: { countries: Array<{ id: string; name: string; nameAr: string }> }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.get('type'),
        name: form.get('name'),
        nameAr: form.get('nameAr'),
        countryId: form.get('countryId'),
        adminEmail: form.get('adminEmail'),
        adminName: form.get('adminName'),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إنشاء الجهة الصحية.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + إضافة جهة صحية
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Select name="type" required defaultValue="">
        <option value="" disabled>
          نوع الجهة
        </option>
        {TENANT_TYPES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select name="countryId" required defaultValue="">
        <option value="" disabled>
          الدولة
        </option>
        {countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nameAr}
          </option>
        ))}
      </Select>
      <Input name="name" placeholder="الاسم (إنجليزي)" required />
      <Input name="nameAr" placeholder="الاسم (عربي)" required />
      <Input name="adminName" placeholder="اسم المدير المسؤول" required />
      <Input name="adminEmail" type="email" placeholder="بريد المدير المسؤول" required />
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

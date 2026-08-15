'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

interface Props {
  branches: Array<{ id: string; name: string }>;
  specialties: Array<{ id: string; nameAr: string }>;
}

export function NewDoctorForm({ branches, specialties }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const branchIds = form.getAll('branchIds') as string[];

    const res = await fetch('/api/v1/tenant/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        name: form.get('name'),
        nameAr: form.get('nameAr') || undefined,
        specialtyId: form.get('specialtyId'),
        licenseNumber: form.get('licenseNumber'),
        consultationPriceMinor: Math.round(Number(form.get('consultationPrice')) * 100),
        branchIds,
        initialPassword: form.get('initialPassword') || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة الطبيب.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4" disabled={branches.length === 0}>
        + إضافة طبيب
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Input name="name" placeholder="الاسم (إنجليزي)" required />
      <Input name="nameAr" placeholder="الاسم (عربي)" />
      <Input name="email" type="email" placeholder="البريد الإلكتروني" required />
      <Input name="licenseNumber" placeholder="رقم الترخيص" required />
      <Select name="specialtyId" required defaultValue="">
        <option value="" disabled>
          التخصص
        </option>
        {specialties.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nameAr}
          </option>
        ))}
      </Select>
      <Input name="consultationPrice" type="number" step="0.01" min="0" placeholder="سعر الاستشارة (JOD)" required />
      <div className="col-span-2">
        <Input name="initialPassword" placeholder="كلمة سر أولية (اختياري)" />
        <p className="mt-1 text-xs text-neutral-500">
          إذا تركتها فارغة، سيُعطى الطبيب كلمة سر افتراضية ويُطلب منه تغييرها عند أول دخول. إذا
          كتبت كلمة سر هنا، أعطها للطبيب مباشرة — ستكون هي كلمة دخوله فوراً بلا إجبار على تغييرها.
        </p>
      </div>
      <fieldset className="col-span-2">
        <legend className="mb-1 text-sm text-neutral-700">الفروع</legend>
        <div className="flex flex-wrap gap-3">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="branchIds" value={b.id} /> {b.name}
            </label>
          ))}
        </div>
      </fieldset>
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

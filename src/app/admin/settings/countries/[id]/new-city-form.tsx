'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewCityForm({ countryId }: { countryId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/admin/countries/${countryId}/cities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), nameAr: form.get('nameAr') }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة المدينة.');
      return;
    }

    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-start gap-2">
      <Input name="name" placeholder="اسم المدينة (إنجليزي)" required className="max-w-xs" />
      <Input name="nameAr" placeholder="اسم المدينة (عربي)" required className="max-w-xs" />
      <Button type="submit" disabled={submitting}>
        {submitting ? '...' : 'إضافة مدينة'}
      </Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

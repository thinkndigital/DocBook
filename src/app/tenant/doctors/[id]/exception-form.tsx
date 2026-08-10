'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

const TYPE_LABELS: Record<string, string> = {
  HOLIDAY: 'عطلة',
  LEAVE: 'إجازة',
  EMERGENCY_CLOSURE: 'إغلاق طارئ',
};

export function ExceptionForm({ doctorId, branches }: { doctorId: string; branches: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/tenant/doctors/${doctorId}/schedule-exceptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: form.get('branchId'),
        date: form.get('date'),
        type: form.get('type'),
        reason: form.get('reason') || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إضافة الاستثناء.');
      return;
    }

    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Select name="branchId" required defaultValue="">
        <option value="" disabled>
          الفرع
        </option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Input name="date" type="date" required />
      <Select name="type" required defaultValue="HOLIDAY">
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input name="reason" placeholder="السبب (اختياري)" />
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting} className="col-span-full w-fit">
        {submitting ? '...' : 'إضافة استثناء'}
      </Button>
    </form>
  );
}

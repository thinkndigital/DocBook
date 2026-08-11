'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

const ENTITY_LABELS: Array<[string, string]> = [
  ['PLATFORM', 'المنصة'],
  ['REPRESENTATIVE', 'المندوب'],
  ['DOCTOR', 'الطبيب'],
];

export function CommissionRuleForm({ tenants }: { tenants: Array<{ id: string; nameAr: string }> }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const tenantId = String(form.get('tenantId') ?? '');
    const pct = form.get('percentage');

    const res = await fetch('/api/v1/admin/commission-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantId || null,
        entityType: form.get('entityType'),
        percentage: pct ? Number(pct) : null,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر حفظ القاعدة.');
      return;
    }

    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-4">
      <Select name="entityType" required defaultValue="">
        <option value="" disabled>
          الجهة المستفيدة
        </option>
        {ENTITY_LABELS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <Select name="tenantId" defaultValue="">
        <option value="">قاعدة عامة (كل الجهات)</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nameAr}
          </option>
        ))}
      </Select>
      <Input name="percentage" type="number" step="0.1" min="0" max="100" placeholder="النسبة %" required />
      <Button type="submit" disabled={submitting}>
        {submitting ? '...' : 'حفظ القاعدة'}
      </Button>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

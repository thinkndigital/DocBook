'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { TenantStatus } from '@prisma/client';

const ACTIONS: Record<TenantStatus, Array<{ next: TenantStatus; label: string; variant: 'primary' | 'danger' }>> = {
  PENDING_VERIFICATION: [
    { next: 'ACTIVE', label: 'توثيق وتفعيل', variant: 'primary' },
    { next: 'REJECTED', label: 'رفض', variant: 'danger' },
  ],
  ACTIVE: [{ next: 'SUSPENDED', label: 'إيقاف', variant: 'danger' }],
  SUSPENDED: [{ next: 'ACTIVE', label: 'إعادة تفعيل', variant: 'primary' }],
  REJECTED: [],
};

export function TenantStatusActions({ tenantId, status }: { tenantId: string; status: TenantStatus }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<TenantStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(next: TenantStatus) {
    setSubmitting(next);
    setError(null);

    let reason: string | undefined;
    if (next === 'SUSPENDED' || next === 'REJECTED') {
      reason = window.prompt('سبب هذا الإجراء (اختياري):') ?? undefined;
    }

    const res = await fetch(`/api/v1/admin/tenants/${tenantId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, reason }),
    });

    setSubmitting(null);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تنفيذ الإجراء.');
      return;
    }

    router.refresh();
  }

  const actions = ACTIONS[status];
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {actions.map((action) => (
          <Button
            key={action.next}
            variant={action.variant}
            disabled={submitting !== null}
            onClick={() => transition(action.next)}
          >
            {submitting === action.next ? '...' : action.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

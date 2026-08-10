'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Status =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_QUEUE'
  | 'CALLED'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

const NEXT_ACTIONS: Record<Status, Array<{ status: Status; label: string; variant: 'primary' | 'danger' | 'secondary' }>> = {
  PENDING: [{ status: 'CONFIRMED', label: 'تأكيد', variant: 'primary' }],
  CONFIRMED: [
    { status: 'CHECKED_IN', label: 'تسجيل الوصول', variant: 'primary' },
    { status: 'NO_SHOW', label: 'لم يحضر', variant: 'secondary' },
    { status: 'CANCELLED', label: 'إلغاء', variant: 'danger' },
  ],
  CHECKED_IN: [
    { status: 'IN_QUEUE', label: 'إضافة للطابور', variant: 'primary' },
    { status: 'CANCELLED', label: 'إلغاء', variant: 'danger' },
  ],
  IN_QUEUE: [
    { status: 'CALLED', label: 'استدعاء', variant: 'primary' },
    { status: 'CANCELLED', label: 'إلغاء', variant: 'danger' },
  ],
  CALLED: [
    { status: 'IN_CONSULTATION', label: 'بدء الكشف', variant: 'primary' },
    { status: 'NO_SHOW', label: 'لم يحضر', variant: 'secondary' },
  ],
  IN_CONSULTATION: [{ status: 'COMPLETED', label: 'إنهاء الكشف', variant: 'primary' }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
};

export function AppointmentActions({ appointmentId, status }: { appointmentId: string; status: Status }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(next: Status) {
    setSubmitting(next);
    setError(null);
    let cancelReason: string | undefined;
    if (next === 'CANCELLED') cancelReason = window.prompt('سبب الإلغاء (اختياري):') ?? undefined;

    const res = await fetch(`/api/v1/tenant/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, cancelReason }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تنفيذ الإجراء.');
      return;
    }
    router.refresh();
  }

  async function reschedule() {
    const value = window.prompt('أدخل الموعد الجديد (YYYY-MM-DDTHH:MM):');
    if (!value) return;
    setSubmitting('RESCHEDULE');
    setError(null);
    const scheduledAt = new Date(`${value}:00.000Z`).toISOString();
    const res = await fetch(`/api/v1/tenant/appointments/${appointmentId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تغيير الموعد.');
      return;
    }
    router.refresh();
  }

  const actions = NEXT_ACTIONS[status];
  const canReschedule = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_QUEUE'].includes(status);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {actions.map((a) => (
          <Button key={a.status} variant={a.variant} disabled={submitting !== null} onClick={() => transition(a.status)}>
            {submitting === a.status ? '...' : a.label}
          </Button>
        ))}
        {canReschedule && (
          <Button variant="secondary" disabled={submitting !== null} onClick={reschedule}>
            {submitting === 'RESCHEDULE' ? '...' : 'تأجيل'}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

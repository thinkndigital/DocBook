'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const METHOD_LABELS: Array<[string, string]> = [
  ['CASH', 'نقداً'],
  ['CARD', 'بطاقة'],
  ['INSURANCE', 'تأمين'],
  ['BANK_TRANSFER', 'حوالة بنكية'],
];

interface Props {
  appointmentId: string;
  paymentStatus: string | null;
  paymentId: string | null;
  canRefund: boolean;
}

export function PaymentButton({ appointmentId, paymentStatus, paymentId, canRefund }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function collect(method: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/v1/tenant/appointments/${appointmentId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method }),
    });
    setSubmitting(false);
    setOpen(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تحصيل الدفعة.');
      return;
    }
    router.refresh();
  }

  async function refund() {
    if (!paymentId) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/v1/tenant/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر رد المبلغ.');
      return;
    }
    router.refresh();
  }

  if (paymentStatus === 'PAID') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs font-medium text-emerald-700">مدفوع</span>
        {canRefund && (
          <button
            type="button"
            disabled={submitting}
            onClick={refund}
            className="text-xs text-red-700 underline hover:no-underline disabled:opacity-50"
          >
            {submitting ? '...' : 'رد المبلغ'}
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED') {
    return <span className="text-xs text-neutral-500">مُسترد</span>;
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          تحصيل
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {METHOD_LABELS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          disabled={submitting}
          onClick={() => collect(value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:border-brand-400 disabled:opacity-50"
        >
          {label}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-xs text-neutral-500">
        إلغاء
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const NEXT_STATUS: Record<string, 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | null> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'SHIPPED',
  SHIPPED: 'DELIVERED',
  DELIVERED: null,
  CANCELLED: null,
};

const NEXT_LABEL: Record<string, string> = {
  CONFIRMED: 'تأكيد الطلب',
  SHIPPED: 'تحديد كمشحون',
  DELIVERED: 'تحديد كمُسلَّم',
};

export function OrderStatusActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = NEXT_STATUS[status];

  async function update(nextStatus: string) {
    setBusy(true);
    await fetch(`/api/v1/supplier/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusy(false);
    router.refresh();
  }

  if (!next && status !== 'PENDING' && status !== 'CONFIRMED') return null;

  return (
    <div className="mt-2 flex gap-2">
      {next && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => update(next)}>
          {NEXT_LABEL[next]}
        </Button>
      )}
      {(status === 'PENDING' || status === 'CONFIRMED') && (
        <Button type="button" variant="danger" disabled={busy} onClick={() => update('CANCELLED')}>
          إلغاء
        </Button>
      )}
    </div>
  );
}

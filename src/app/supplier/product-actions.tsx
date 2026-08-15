'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ProductActions({ productId, status }: { productId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: 'PUBLISHED' | 'ARCHIVED') {
    setBusy(true);
    await fetch(`/api/v1/supplier/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm('حذف هذا المنتج؟')) return;
    setBusy(true);
    await fetch(`/api/v1/supplier/products/${productId}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status === 'DRAFT' && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setStatus('PUBLISHED')}>
          نشر
        </Button>
      )}
      {status === 'PUBLISHED' && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setStatus('ARCHIVED')}>
          أرشفة
        </Button>
      )}
      <Button type="button" variant="danger" disabled={busy} onClick={remove}>
        حذف
      </Button>
    </div>
  );
}

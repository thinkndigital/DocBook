'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ReviewModerationActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: 'APPROVED' | 'REJECTED') {
    setSubmitting(status);
    setError(null);
    const res = await fetch(`/api/v1/tenant/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تنفيذ الإجراء.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <Button variant="primary" disabled={submitting !== null} onClick={() => decide('APPROVED')}>
        {submitting === 'APPROVED' ? '...' : 'اعتماد'}
      </Button>
      <Button variant="danger" disabled={submitting !== null} onClick={() => decide('REJECTED')}>
        {submitting === 'REJECTED' ? '...' : 'رفض'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

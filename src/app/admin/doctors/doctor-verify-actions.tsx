'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function DoctorVerifyActions({ doctorId }: { doctorId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(verificationStatus: 'VERIFIED' | 'REJECTED') {
    setSubmitting(verificationStatus);
    setError(null);

    const res = await fetch(`/api/v1/admin/doctors/${doctorId}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationStatus }),
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button disabled={submitting !== null} onClick={() => decide('VERIFIED')}>
          {submitting === 'VERIFIED' ? '...' : 'توثيق'}
        </Button>
        <Button variant="danger" disabled={submitting !== null} onClick={() => decide('REJECTED')}>
          {submitting === 'REJECTED' ? '...' : 'رفض'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

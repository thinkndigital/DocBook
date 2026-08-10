'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function PlanToggle({ planId, isActive }: { planId: string; isActive: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    setSubmitting(true);
    await fetch(`/api/v1/admin/subscription-plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <Button variant="secondary" disabled={submitting} onClick={toggle}>
      {submitting ? '...' : isActive ? 'تعطيل' : 'تفعيل'}
    </Button>
  );
}

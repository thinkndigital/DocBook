'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export function CancelButton({ appointmentId, dict }: { appointmentId: string; dict: Dictionary }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleCancel() {
    setSubmitting(true);
    await fetch(`/api/v1/patient/appointments/${appointmentId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={submitting}
      onClick={handleCancel}
      className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {submitting ? dict.common.loading : dict.patientDashboard.cancelAppointment}
    </button>
  );
}

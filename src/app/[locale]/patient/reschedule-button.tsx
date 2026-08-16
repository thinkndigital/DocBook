'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dictionary } from '@/lib/i18n/dictionaries';

interface Props {
  appointmentId: string;
  doctorId: string;
  branchId: string;
  dict: Dictionary;
}

export function RescheduleButton({ appointmentId, doctorId, branchId, dict }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSlots(nextDate: string) {
    setDate(nextDate);
    setSlots([]);
    setError(null);
    if (!nextDate) return;
    setLoadingSlots(true);
    const res = await fetch(`/api/v1/public/doctors/${doctorId}/availability?branchId=${branchId}&date=${nextDate}`);
    setLoadingSlots(false);
    if (!res.ok) return;
    const body = await res.json();
    setSlots(body.data.slots);
  }

  async function pickSlot(slot: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/v1/patient/appointments/${appointmentId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: slot }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(dict.patientDashboard.rescheduleFailed);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
      >
        {dict.patientDashboard.rescheduleAppointment}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-0 top-full z-10 mt-2 w-72 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-900">{dict.patientDashboard.rescheduleTitle}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:underline">
          {dict.patientDashboard.rescheduleClose}
        </button>
      </div>
      <input
        type="date"
        value={date}
        min={new Date().toISOString().slice(0, 10)}
        onChange={(e) => loadSlots(e.target.value)}
        className="mb-3 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      {loadingSlots && <p className="text-sm text-neutral-500">{dict.common.loading}</p>}
      {!loadingSlots && date && slots.length === 0 && (
        <p className="text-sm text-amber-700">{dict.patientDashboard.rescheduleNoSlots}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => (
          <button
            key={slot}
            type="button"
            disabled={submitting}
            onClick={() => pickSlot(slot)}
            className="rounded-md border border-brand-300 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {slot.slice(11, 16)}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

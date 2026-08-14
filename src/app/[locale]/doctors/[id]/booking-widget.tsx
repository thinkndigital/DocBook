'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

interface Props {
  locale: Locale;
  dict: Dictionary;
  doctorId: string;
  branches: Array<{ id: string; name: string; nameAr?: string }>;
  services: Array<{ id: string; name: string; nameAr: string; priceMinor: number; currency: string }>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function BookingWidget({ locale, dict, doctorId, branches, services }: Props) {
  const router = useRouter();
  // Read here rather than as a prop from the server. The profile page is statically
  // rendered and cached (see its `revalidate`), which it could not be if the server had to
  // know who was asking; a cached page that baked in one visitor's signed-in state would
  // then show it to everyone. This is also the only component that needs the answer.
  const { status, data: session } = useSession();
  const isAuthenticatedPatient = session?.user?.role === 'PATIENT';
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const nameKey: 'name' | 'nameAr' = locale === 'ar' ? 'nameAr' : 'name';

  async function fetchSlots(nextBranchId: string, nextDate: string) {
    if (!nextBranchId || !nextDate) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    const res = await fetch(`/api/v1/public/doctors/${doctorId}/availability?branchId=${nextBranchId}&date=${nextDate}`);
    setLoadingSlots(false);
    if (!res.ok) return;
    const body = await res.json();
    setSlots(body.data.slots);
  }

  async function handleConfirm() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/v1/patient/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId, branchId, serviceId, scheduledAt: selectedSlot }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? dict.doctorProfile.bookingFailed);
      return;
    }

    setSuccess(true);
    router.push(`/${locale}/patient`);
    router.refresh();
  }

  if (success) {
    return <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">{dict.doctorProfile.bookingConfirmed}</p>;
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-4 font-semibold text-neutral-900">{dict.doctorProfile.bookAppointment}</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            fetchSlots(e.target.value, date);
          }}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b[nameKey] ?? b.name}
            </option>
          ))}
        </select>
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s[nameKey]} ({(s.priceMinor / 100).toFixed(2)} {s.currency})
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            fetchSlots(branchId, e.target.value);
          }}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm text-neutral-600">{dict.doctorProfile.availableSlots}</p>
        {loadingSlots && <p className="text-sm text-neutral-500">{dict.common.loading}</p>}
        {!loadingSlots && slots.length === 0 && <p className="text-sm text-amber-700">{dict.doctorProfile.noSlots}</p>}
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const time = new Date(slot).toISOString().slice(11, 16);
            return (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  selectedSlot === slot
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-brand-400'
                }`}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        {status === 'loading' ? (
          // Same height as the resolved button, so confirming a slot never moves under the
          // cursor as the session settles.
          <div aria-hidden className="h-9 w-40 rounded-md bg-neutral-100" />
        ) : isAuthenticatedPatient ? (
          <button
            type="button"
            disabled={!selectedSlot || submitting}
            onClick={handleConfirm}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-neutral-300"
          >
            {submitting ? dict.common.loading : dict.doctorProfile.confirmBooking}
          </button>
        ) : (
          <a
            href={`/${locale}/login?callbackUrl=/${locale}/doctors/${doctorId}`}
            className="inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {dict.doctorProfile.loginToBook}
          </a>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

interface Doctor {
  id: string;
  user: { name: string };
  specialty: { nameAr: string };
  branches: Array<{ branchId: string }>;
}
interface Props {
  branches: Array<{ id: string; name: string }>;
  doctors: Doctor[];
  services: Array<{ id: string; nameAr: string; priceMinor: number; currency: string }>;
}

interface PatientMatch {
  id: string;
  user: { name: string; email: string };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function NewAppointmentForm({ branches, doctors, services }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [patientEmail, setPatientEmail] = useState('');
  const [patientMatch, setPatientMatch] = useState<PatientMatch | null | undefined>(undefined);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableDoctors = branchId ? doctors.filter((d) => d.branches.some((b) => b.branchId === branchId)) : [];

  async function fetchSlots(nextDoctorId: string, nextBranchId: string, nextDate: string) {
    if (!nextDoctorId || !nextBranchId || !nextDate) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    const res = await fetch(
      `/api/v1/tenant/doctors/${nextDoctorId}/availability?branchId=${nextBranchId}&date=${nextDate}`
    );
    setLoadingSlots(false);
    if (!res.ok) return;
    const body = await res.json();
    setSlots(body.data.slots);
  }

  async function lookupPatient() {
    if (!patientEmail) return;
    setLookingUp(true);
    setPatientMatch(undefined);
    const res = await fetch(`/api/v1/tenant/patients?email=${encodeURIComponent(patientEmail)}`);
    setLookingUp(false);
    if (!res.ok) return;
    const body = await res.json();
    setPatientMatch(body.data);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    if (!selectedSlot) {
      setSubmitting(false);
      setError('اختر موعداً متاحاً أولاً.');
      return;
    }

    const patientPayload = patientMatch
      ? { patientId: patientMatch.id }
      : { newPatient: { email: patientEmail, name: newPatientName, phone: newPatientPhone || undefined } };

    const res = await fetch('/api/v1/tenant/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId,
        branchId,
        serviceId,
        scheduledAt: selectedSlot,
        ...patientPayload,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إنشاء الموعد.');
      return;
    }

    setOpen(false);
    setSelectedSlot(null);
    setSlots([]);
    setPatientMatch(undefined);
    setPatientEmail('');
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        + حجز موعد
      </Button>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setDoctorId('');
            setSlots([]);
          }}
        >
          <option value="">اختر الفرع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          value={doctorId}
          disabled={!branchId}
          onChange={(e) => {
            setDoctorId(e.target.value);
            fetchSlots(e.target.value, branchId, date);
          }}
        >
          <option value="">اختر الطبيب</option>
          {availableDoctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name} — {d.specialty.nameAr}
            </option>
          ))}
        </Select>
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameAr} ({(s.priceMinor / 100).toFixed(2)} {s.currency})
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            fetchSlots(doctorId, branchId, e.target.value);
          }}
        />
      </div>

      <div className="mt-4">
        {loadingSlots && <p className="text-sm text-neutral-500">...جارٍ تحميل الأوقات المتاحة</p>}
        {!loadingSlots && doctorId && slots.length === 0 && (
          <p className="text-sm text-amber-700">لا توجد أوقات متاحة في هذا اليوم.</p>
        )}
        {slots.length > 0 && (
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
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 flex gap-2">
          <Input
            placeholder="بريد المريض الإلكتروني"
            value={patientEmail}
            onChange={(e) => {
              setPatientEmail(e.target.value);
              setPatientMatch(undefined);
            }}
          />
          <Button type="button" variant="secondary" disabled={!patientEmail || lookingUp} onClick={lookupPatient}>
            {lookingUp ? '...' : 'بحث'}
          </Button>
        </div>
        {patientMatch === null && (
          <>
            <Input placeholder="اسم المريض (جديد)" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} />
            <Input placeholder="رقم الهاتف" value={newPatientPhone} onChange={(e) => setNewPatientPhone(e.target.value)} />
          </>
        )}
        {patientMatch && (
          <p className="col-span-2 self-center text-sm text-emerald-700">مريض موجود: {patientMatch.user.name}</p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          disabled={
            submitting ||
            !selectedSlot ||
            !patientEmail ||
            (patientMatch === null && !newPatientName) ||
            patientMatch === undefined
          }
          onClick={handleSubmit}
        >
          {submitting ? '...جارٍ الحجز' : 'تأكيد الحجز'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

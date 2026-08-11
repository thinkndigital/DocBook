'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

interface Tenant {
  id: string;
  nameAr: string;
}
interface RepDoctor {
  id: string;
  user: { name: string };
  specialty: { nameAr: string };
  tenant: { id: string };
  branches: Array<{ branch: { id: string; name: string } }>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function RepBookingForm({ tenants, services }: { tenants: Tenant[]; services: Array<{ id: string; nameAr: string; tenantId: string }> }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [doctors, setDoctors] = useState<RepDoctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [patientEmail, setPatientEmail] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const tenantServices = services.filter((s) => s.tenantId === tenantId);
  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  useEffect(() => {
    if (!tenantId) {
      setDoctors([]);
      return;
    }
    fetch(`/api/v1/rep/doctors?tenantId=${tenantId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body) => setDoctors(body.data ?? []));
    setDoctorId('');
    setBranchId('');
    setSlots([]);
    setSelectedSlot(null);
    setServiceId('');
  }, [tenantId]);

  async function fetchSlots(nextDoctorId: string, nextBranchId: string, nextDate: string) {
    if (!nextDoctorId || !nextBranchId || !nextDate) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    const res = await fetch(`/api/v1/rep/doctors/${nextDoctorId}/availability?branchId=${nextBranchId}&date=${nextDate}`);
    setLoadingSlots(false);
    if (!res.ok) return;
    const body = await res.json();
    setSlots(body.data.slots);
  }

  async function handleSubmit() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/v1/rep/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId,
        branchId,
        serviceId,
        scheduledAt: selectedSlot,
        // createAppointment attaches the existing patient when the email is already
        // registered, so this one shape covers both new and returning patients.
        newPatient: { email: patientEmail, name: patientName, phone: patientPhone || undefined },
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إتمام الحجز.');
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  if (success) {
    return (
      <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
        تم الحجز بنجاح.{' '}
        <button type="button" className="font-medium underline" onClick={() => { setSuccess(false); setSelectedSlot(null); setSlots([]); }}>
          حجز آخر
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">اختر الجهة الصحية</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nameAr}
            </option>
          ))}
        </Select>
        <Select
          value={doctorId}
          disabled={!tenantId}
          onChange={(e) => {
            setDoctorId(e.target.value);
            setBranchId('');
            setSlots([]);
          }}
        >
          <option value="">اختر الطبيب</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name} — {d.specialty.nameAr}
            </option>
          ))}
        </Select>
        <Select
          value={branchId}
          disabled={!doctorId}
          onChange={(e) => {
            setBranchId(e.target.value);
            fetchSlots(doctorId, e.target.value, date);
          }}
        >
          <option value="">اختر الفرع</option>
          {selectedDoctor?.branches.map((b) => (
            <option key={b.branch.id} value={b.branch.id}>
              {b.branch.name}
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
        <Select value={serviceId} disabled={!tenantId} onChange={(e) => setServiceId(e.target.value)} className="col-span-2">
          <option value="">اختر الخدمة</option>
          {tenantServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameAr}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4">
        {loadingSlots && <p className="text-sm text-neutral-500">...جارٍ تحميل الأوقات</p>}
        {!loadingSlots && branchId && slots.length === 0 && <p className="text-sm text-amber-700">لا توجد أوقات متاحة.</p>}
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
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
              {new Date(slot).toISOString().slice(11, 16)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Input placeholder="بريد المريض الإلكتروني" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} />
        <Input placeholder="اسم المريض" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
        <Input placeholder="رقم الهاتف" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Button
        className="mt-4"
        disabled={submitting || !selectedSlot || !serviceId || !patientEmail || !patientName}
        onClick={handleSubmit}
      >
        {submitting ? '...جارٍ الحجز' : 'تأكيد الحجز'}
      </Button>
    </div>
  );
}

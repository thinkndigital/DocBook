'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

const RECORD_TYPES: Array<[string, string]> = [
  ['VISIT_NOTE', 'ملاحظة زيارة'],
  ['DIAGNOSIS', 'تشخيص'],
  ['LAB_REPORT', 'تقرير مخبري'],
  ['IMAGING', 'تقرير أشعة'],
];

export function NewRecordForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/doctor/patients/${patientId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.get('type'),
        diagnosis: form.get('diagnosis') || undefined,
        notes: form.get('notes') || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر حفظ السجل.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button className="mb-4" onClick={() => setOpen(true)}>
        + إضافة سجل طبي
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Select name="type" required defaultValue="VISIT_NOTE">
        {RECORD_TYPES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <Input name="diagnosis" placeholder="التشخيص" />
      <textarea
        name="notes"
        rows={4}
        placeholder="ملاحظات سريرية"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الحفظ' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

interface Appointment {
  id: string;
  scheduledAt: string;
}

export function NewPrescriptionForm({ appointments }: { appointments: Appointment[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meds, setMeds] = useState([{ name: '', dosage: '', frequency: '', durationDays: '' }]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await fetch('/api/v1/doctor/prescriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: form.get('appointmentId'),
        diagnosis: form.get('diagnosis') || undefined,
        instructions: form.get('instructions') || undefined,
        medications: meds
          .filter((m) => m.name && m.dosage && m.frequency)
          .map((m) => ({
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            durationDays: m.durationDays ? Number(m.durationDays) : undefined,
          })),
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر إصدار الوصفة.');
      return;
    }
    setOpen(false);
    setMeds([{ name: '', dosage: '', frequency: '', durationDays: '' }]);
    router.refresh();
  }

  if (!open) {
    return (
      <Button className="mb-4" variant="secondary" onClick={() => setOpen(true)} disabled={appointments.length === 0}>
        + إصدار وصفة طبية
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Select name="appointmentId" required defaultValue="">
        <option value="" disabled>
          اختر الموعد المرتبط
        </option>
        {appointments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.scheduledAt.slice(0, 16).replace('T', ' ')}
          </option>
        ))}
      </Select>
      <Input name="diagnosis" placeholder="التشخيص" />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-700">الأدوية</span>
        {meds.map((m, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <Input
              placeholder="اسم الدواء"
              value={m.name}
              onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              placeholder="الجرعة"
              value={m.dosage}
              onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, dosage: e.target.value } : x)))}
            />
            <Input
              placeholder="التكرار"
              value={m.frequency}
              onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))}
            />
            <Input
              type="number"
              min={1}
              placeholder="عدد الأيام"
              value={m.durationDays}
              onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, durationDays: e.target.value } : x)))}
            />
          </div>
        ))}
        <button
          type="button"
          className="w-fit text-sm text-brand-700 hover:underline"
          onClick={() => setMeds([...meds, { name: '', dosage: '', frequency: '', durationDays: '' }])}
        >
          + دواء آخر
        </button>
      </div>

      <textarea
        name="instructions"
        rows={2}
        placeholder="تعليمات عامة"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '...جارٍ الإصدار' : 'إصدار الوصفة'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

interface ScheduleDay {
  dayOfWeek: number;
  branchId: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

interface Props {
  doctorId: string;
  branches: Array<{ id: string; name: string }>;
  initialSchedule: Array<{ dayOfWeek: number; branchId: string; startTime: string; endTime: string; slotDurationMinutes: number; bufferMinutes: number }>;
}

function buildInitialRows(branches: Props['branches'], initial: Props['initialSchedule']): ScheduleDay[] {
  const defaultBranchId = branches[0]?.id ?? '';
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const existing = initial.find((s) => s.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      branchId: existing?.branchId ?? defaultBranchId,
      startTime: existing?.startTime ?? '09:00',
      endTime: existing?.endTime ?? '17:00',
      slotDurationMinutes: existing?.slotDurationMinutes ?? 20,
      bufferMinutes: existing?.bufferMinutes ?? 0,
      isActive: Boolean(existing),
    };
  });
}

export function ScheduleEditor({ doctorId, branches, initialSchedule }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ScheduleDay[]>(() => buildInitialRows(branches, initialSchedule));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateRow(dayOfWeek: number, patch: Partial<ScheduleDay>) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const days = rows
      .filter((r) => r.isActive)
      .map(({ isActive, ...rest }) => rest);

    const res = await fetch(`/api/v1/tenant/doctors/${doctorId}/schedules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر حفظ الجدول.');
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="text-neutral-600">
            <tr>
              <th className="py-2 font-medium">اليوم</th>
              <th className="py-2 font-medium">الفرع</th>
              <th className="py-2 font-medium">من</th>
              <th className="py-2 font-medium">إلى</th>
              <th className="py-2 font-medium">مدة الموعد (د)</th>
              <th className="py-2 font-medium">فاصل (د)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dayOfWeek} className="border-t border-neutral-100">
                <td className="py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.isActive}
                      onChange={(e) => updateRow(row.dayOfWeek, { isActive: e.target.checked })}
                    />
                    {DAY_LABELS[row.dayOfWeek]}
                  </label>
                </td>
                <td className="py-2">
                  <Select
                    value={row.branchId}
                    disabled={!row.isActive}
                    onChange={(e) => updateRow(row.dayOfWeek, { branchId: e.target.value })}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-2">
                  <Input
                    type="time"
                    value={row.startTime}
                    disabled={!row.isActive}
                    onChange={(e) => updateRow(row.dayOfWeek, { startTime: e.target.value })}
                  />
                </td>
                <td className="py-2">
                  <Input
                    type="time"
                    value={row.endTime}
                    disabled={!row.isActive}
                    onChange={(e) => updateRow(row.dayOfWeek, { endTime: e.target.value })}
                  />
                </td>
                <td className="py-2">
                  <Input
                    type="number"
                    min={5}
                    max={240}
                    value={row.slotDurationMinutes}
                    disabled={!row.isActive}
                    onChange={(e) => updateRow(row.dayOfWeek, { slotDurationMinutes: Number(e.target.value) })}
                  />
                </td>
                <td className="py-2">
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={row.bufferMinutes}
                    disabled={!row.isActive}
                    onChange={(e) => updateRow(row.dayOfWeek, { bufferMinutes: Number(e.target.value) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-emerald-700">تم الحفظ.</p>}
      <Button className="mt-4" disabled={submitting || branches.length === 0} onClick={handleSave}>
        {submitting ? '...جارٍ الحفظ' : 'حفظ الجدول'}
      </Button>
    </div>
  );
}

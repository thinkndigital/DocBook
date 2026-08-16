import { Badge } from '@/components/ui/badge';
import { searchAppointmentsAdmin } from '@/lib/services/admin-ops';
import type { AppointmentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CHECKED_IN: 'success',
  IN_QUEUE: 'warning',
  CALLED: 'warning',
  IN_CONSULTATION: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
  RESCHEDULED: 'neutral',
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'قيد الانتظار',
  CONFIRMED: 'مؤكد',
  CHECKED_IN: 'تم الوصول',
  IN_QUEUE: 'في الطابور',
  CALLED: 'تم الاستدعاء',
  IN_CONSULTATION: 'قيد الكشف',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
  NO_SHOW: 'لم يحضر',
  RESCHEDULED: 'تم التأجيل',
};

export default async function AdminAppointmentsPage({ searchParams }: { searchParams: { query?: string } }) {
  const query = searchParams.query ?? '';
  const results = query ? await searchAppointmentsAdmin(query) : [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">بحث المواعيد</h1>
      <p className="mb-6 text-sm text-neutral-500">
        بحث عبر كل الجهات الصحية لأغراض الدعم الفني — برقم الموعد، أو اسم/بريد المريض، أو اسم الطبيب. لا يعرض ملاحظات
        الموعد أو أي محتوى طبي.
      </p>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <input
          type="text"
          name="query"
          defaultValue={query}
          placeholder="رقم الموعد، اسم/بريد المريض، أو اسم الطبيب"
          className="min-w-[20rem] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
          بحث
        </button>
      </form>

      {query && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-medium">الموعد</th>
                <th className="px-4 py-3 font-medium">المريض</th>
                <th className="px-4 py-3 font-medium">الطبيب</th>
                <th className="px-4 py-3 font-medium">الجهة</th>
                <th className="px-4 py-3 font-medium">الوقت</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              )}
              {results.map((appt) => (
                <tr key={appt.id} className="border-t border-neutral-100">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-400">{appt.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{appt.patient.user.name}</div>
                    <div className="text-xs text-neutral-500">{appt.patient.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{appt.doctor.user.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{appt.tenant.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {appt.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

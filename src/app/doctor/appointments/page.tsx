import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { listOwnDoctorAppointments } from '@/lib/services/appointments';
import { AppointmentActions } from '@/app/tenant/appointments/appointment-actions';
import { LiveRefresh } from '@/components/live-refresh';

const JOINABLE_CALL_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'IN_QUEUE', 'CALLED', 'IN_CONSULTATION'];

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
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

const STATUS_LABEL: Record<string, string> = {
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

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default async function DoctorAppointmentsPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getServerSession(authOptions);
  const today = isoDate(0);
  const tomorrow = isoDate(1);
  const date = searchParams.date ?? today;
  const appointments = await listOwnDoctorAppointments(session!.user.id, { date });

  const dayLabel = date === today ? 'مواعيد اليوم' : date === tomorrow ? 'مواعيد الغد' : 'مواعيد يوم ' + date;

  return (
    <div>
      <LiveRefresh />
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">{dayLabel}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`?date=${today}`}
          className={`rounded-md px-3 py-1.5 text-sm ${date === today ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
        >
          اليوم
        </a>
        <a
          href={`?date=${tomorrow}`}
          className={`rounded-md px-3 py-1.5 text-sm ${date === tomorrow ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
        >
          الغد
        </a>
      </div>
      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white">
          عرض
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">الوقت</th>
              <th className="px-4 py-3 font-medium">المريض</th>
              <th className="px-4 py-3 font-medium">الخدمة</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
              <th className="px-4 py-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {(!appointments || appointments.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد مواعيد في هذا اليوم.
                </td>
              </tr>
            )}
            {appointments?.map((appt) => (
              <tr key={appt.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 text-neutral-600">{appt.queueToken ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.scheduledAt.toISOString().slice(11, 16)}</td>
                <td className="px-4 py-3 font-medium">{appt.patient.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.service.nameAr}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {appt.type === 'VIDEO' && JOINABLE_CALL_STATUSES.includes(appt.status) && (
                      <Link
                        href={`/doctor/appointments/${appt.id}/call`}
                        className="whitespace-nowrap rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                      >
                        الانضمام للمكالمة
                      </Link>
                    )}
                    <AppointmentActions appointmentId={appt.id} status={appt.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

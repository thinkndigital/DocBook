import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { listOwnDoctorAppointments } from '@/lib/services/appointments';
import { AppointmentActions } from '@/app/tenant/appointments/appointment-actions';

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

export default async function DoctorAppointmentsPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getServerSession(authOptions);
  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const appointments = await listOwnDoctorAppointments(session!.user.id, { date });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">مواعيد اليوم</h1>
      <form className="mb-6 flex gap-3" method="get">
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
                  <AppointmentActions appointmentId={appt.id} status={appt.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

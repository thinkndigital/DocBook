import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { getOwnRepresentative, listRepBookedAppointments } from '@/lib/services/representatives';

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

export default async function RepBookingsPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = await getServerSession(authOptions);
  const rep = await getOwnRepresentative(session!.user.id);
  if (!rep) return <p className="text-neutral-600">لا يوجد ملف مندوب مرتبط بهذا الحساب.</p>;

  const appointments = await listRepBookedAppointments(rep.id, { date: searchParams.date });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">حجوزاتي</h1>

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input type="date" name="date" defaultValue={searchParams.date} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white">
          تصفية
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الوقت</th>
              <th className="px-4 py-3 font-medium">المريض</th>
              <th className="px-4 py-3 font-medium">الطبيب</th>
              <th className="px-4 py-3 font-medium">الجهة</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد حجوزات.
                </td>
              </tr>
            )}
            {appointments.map((appt) => (
              <tr key={appt.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 text-neutral-600">{appt.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-3 font-medium">{appt.patient.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.doctor.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.tenant.nameAr}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[appt.status]}>{appt.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

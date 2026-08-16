import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { listAppointments } from '@/lib/services/appointments';
import { listTenantPayments } from '@/lib/services/payments';
import { PaymentButton } from './payment-button';
import { listBranches } from '@/lib/services/branches';
import { listDoctors } from '@/lib/services/doctors';
import { listServices } from '@/lib/services/catalog';
import { NewAppointmentForm } from './new-appointment-form';
import { AppointmentActions } from './appointment-actions';
import { LiveRefresh } from '@/components/live-refresh';

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

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { date?: string; branchId?: string };
}) {
  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const branchId = searchParams.branchId;

  const session = await getServerSession(authOptions);
  const canRefund = session?.user.role === 'TENANT_ADMIN';

  const [appointments, branches, doctors, services, payments] = await Promise.all([
    runInSessionTenant(() => listAppointments({ date, branchId })),
    runInSessionTenant(() => listBranches()),
    runInSessionTenant(() => listDoctors()),
    runInSessionTenant(() => listServices()),
    runInSessionTenant(() => listTenantPayments()),
  ]);

  const paymentByAppointment = new Map(payments.filter((p) => p.appointmentId).map((p) => [p.appointmentId!, p]));

  return (
    <div>
      <LiveRefresh />
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">المواعيد والطابور</h1>

      <NewAppointmentForm branches={branches} doctors={doctors} services={services} />

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select name="branchId" defaultValue={branchId ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">كل الفروع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white">
          تصفية
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">الوقت</th>
              <th className="px-4 py-3 font-medium">المريض</th>
              <th className="px-4 py-3 font-medium">الطبيب</th>
              <th className="px-4 py-3 font-medium">الخدمة</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
              <th className="px-4 py-3 font-medium">الدفع</th>
              <th className="px-4 py-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد مواعيد في هذا اليوم.
                </td>
              </tr>
            )}
            {appointments.map((appt) => (
              <tr key={appt.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 text-neutral-600">{appt.queueToken ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.scheduledAt.toISOString().slice(11, 16)}</td>
                <td className="px-4 py-3 font-medium">{appt.patient.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.doctor.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{appt.service.nameAr}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <PaymentButton
                    appointmentId={appt.id}
                    paymentStatus={paymentByAppointment.get(appt.id)?.status ?? null}
                    paymentId={paymentByAppointment.get(appt.id)?.id ?? null}
                    canRefund={canRefund}
                  />
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

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { listOwnPatientAppointments } from '@/lib/services/appointments';
import { Badge } from '@/components/ui/badge';
import { CancelButton } from './cancel-button';
import { RescheduleButton } from './reschedule-button';
import { AssistantPanel } from './assistant-panel';
import { LiveRefresh } from '@/components/live-refresh';

export const dynamic = 'force-dynamic';

const CANCELLABLE = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_QUEUE'];
const JOINABLE_CALL_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'IN_QUEUE', 'CALLED', 'IN_CONSULTATION'];
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

export default async function PatientDashboardPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  const session = await getServerSession(authOptions);

  if (!session) redirect(`/${params.locale}/login?callbackUrl=/${params.locale}/patient`);
  if (session.user.role !== 'PATIENT') redirect(`/${params.locale}`);

  const appointments = (await listOwnPatientAppointments(session.user.id)) ?? [];
  const now = new Date();
  const upcoming = appointments.filter((a) => a.scheduledAt >= now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status));
  const past = appointments.filter((a) => !upcoming.includes(a));

  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';

  function AppointmentRow({ appt }: { appt: (typeof appointments)[number] }) {
    return (
      <div className="relative flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <div>
          <p className="font-medium text-neutral-900">{appt.doctor.user.name}</p>
          <p className="text-sm text-neutral-600">
            {appt.service[nameKey]} — {appt.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[appt.status]}>{dict.patientDashboard.status[appt.status] ?? appt.status}</Badge>
          {appt.type === 'VIDEO' && JOINABLE_CALL_STATUSES.includes(appt.status) && (
            <a
              href={`/${params.locale}/patient/appointments/${appt.id}/video`}
              className="whitespace-nowrap rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              الانضمام للمكالمة
            </a>
          )}
          {CANCELLABLE.includes(appt.status) && (
            <RescheduleButton
              appointmentId={appt.id}
              doctorId={appt.doctorId}
              branchId={appt.branchId}
              dict={dict}
            />
          )}
          {CANCELLABLE.includes(appt.status) && <CancelButton appointmentId={appt.id} dict={dict} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <LiveRefresh />
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{dict.patientDashboard.title}</h1>

      <div className="mb-8">
        <AssistantPanel locale={params.locale} />
      </div>

      <h2 className="mb-3 font-semibold text-neutral-700">{dict.patientDashboard.upcoming}</h2>
      <div className="mb-8 flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center">
            <p className="mb-3 text-sm text-neutral-500">{dict.patientDashboard.noAppointments}</p>
            <a
              href={`/${params.locale}/doctors`}
              className="inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {dict.patientDashboard.noAppointmentsCta}
            </a>
          </div>
        ) : (
          upcoming.map((appt) => <AppointmentRow key={appt.id} appt={appt} />)
        )}
      </div>

      <h2 className="mb-3 font-semibold text-neutral-700">{dict.patientDashboard.past}</h2>
      <div className="flex flex-col gap-3">
        {past.length === 0 ? (
          <p className="text-sm text-neutral-500">{dict.patientDashboard.noAppointments}</p>
        ) : (
          past.map((appt) => <AppointmentRow key={appt.id} appt={appt} />)
        )}
      </div>
    </div>
  );
}

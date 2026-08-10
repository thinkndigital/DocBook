import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { getDoctor } from '@/lib/services/doctors';
import { getWeeklySchedule, listScheduleExceptions } from '@/lib/services/schedules';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScheduleEditor } from './schedule-editor';
import { ExceptionForm } from './exception-form';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  HOLIDAY: 'عطلة',
  LEAVE: 'إجازة',
  EMERGENCY_CLOSURE: 'إغلاق طارئ',
};

export default async function DoctorScheduleAdminPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const doctor = await runInSessionTenant(() => getDoctor(params.id));
  if (!doctor) notFound();

  const tenantId = session!.user.tenantId!;
  const [schedule, exceptions] = await Promise.all([
    getWeeklySchedule(params.id, tenantId),
    listScheduleExceptions(params.id, tenantId),
  ]);

  const branches = doctor.branches.map((b) => b.branch);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">جدول {doctor.user.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">حدد أيام العمل والفرع والدوام لكل يوم.</p>

      {branches.length === 0 ? (
        <p className="text-sm text-amber-700">لم يتم تعيين هذا الطبيب لأي فرع بعد.</p>
      ) : (
        <ScheduleEditor doctorId={params.id} branches={branches} initialSchedule={schedule} />
      )}

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-neutral-900">العطل والإجازات</h2>
        <ExceptionForm doctorId={params.id} branches={branches} />
        {exceptions.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد استثناءات مضافة.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {exceptions.map((ex) => (
              <li key={ex.id} className="flex justify-between rounded-md bg-neutral-50 px-3 py-2">
                <span>
                  {ex.date.toISOString().slice(0, 10)} — {TYPE_LABELS[ex.type]}
                  {ex.reason ? ` (${ex.reason})` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

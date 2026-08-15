import { Badge } from '@/components/ui/badge';
import { listRepresentatives } from '@/lib/services/representatives';
import { listTenants } from '@/lib/services/tenants';
import { ResetPasswordButton } from '@/components/admin/reset-password-button';
import { NewRepForm, AssignTenantForm } from './rep-forms';

export const dynamic = 'force-dynamic';

export default async function AdminRepresentativesPage() {
  const [reps, { items: tenants }] = await Promise.all([
    listRepresentatives(),
    listTenants({ limit: 100, status: 'ACTIVE' }),
  ]);

  const tenantOptions = tenants.map((t) => ({ id: t.id, nameAr: t.nameAr }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">المندوبون</h1>
      <NewRepForm />

      <div className="flex flex-col gap-4">
        {reps.length === 0 && <p className="text-sm text-neutral-500">لا يوجد مندوبون بعد.</p>}
        {reps.map((rep) => (
          <div key={rep.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-neutral-900">{rep.user.name}</h2>
                <p className="text-sm text-neutral-500">{rep.user.email}</p>
                <div className="mt-1">
                  <ResetPasswordButton endpoint={`/api/v1/admin/representatives/${rep.id}/password`} />
                </div>
              </div>
              <div className="text-left text-sm text-neutral-600">
                <div>{rep._count.bookedAppointments} حجز</div>
                {rep.monthlyTargetAmount !== null && (
                  <div>الهدف: {(rep.monthlyTargetAmount / 100).toFixed(0)} JOD/شهر</div>
                )}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {rep.assignments.length === 0 ? (
                <span className="text-sm text-neutral-500">لا توجد جهات مسندة.</span>
              ) : (
                rep.assignments.map((a) => (
                  <Badge key={a.id} tone={a.tenant.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {a.tenant.nameAr}
                  </Badge>
                ))
              )}
            </div>

            <AssignTenantForm repId={rep.id} tenants={tenantOptions} />
          </div>
        ))}
      </div>
    </div>
  );
}

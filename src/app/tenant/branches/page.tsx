import { db } from '@/lib/db';
import { runInSessionTenant, requireTenantAdminPage } from '@/lib/api/tenant-scope';
import { listBranches } from '@/lib/services/branches';
import { listCities } from '@/lib/services/geography';
import { NewBranchForm } from './new-branch-form';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const session = await requireTenantAdminPage();
  const tenant = await db.tenant.findUnique({ where: { id: session!.user.tenantId! } });
  const [branches, cities] = await Promise.all([
    runInSessionTenant(() => listBranches()),
    listCities(tenant!.countryId),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الفروع</h1>
      <NewBranchForm cities={cities} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {branches.length === 0 && <p className="text-sm text-neutral-500">لا توجد فروع بعد.</p>}
        {branches.map((branch) => (
          <div key={branch.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold text-neutral-900">{branch.name}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {branch.address} — {branch.city.nameAr}
            </p>
            {branch.phone && <p className="mt-1 text-sm text-neutral-500">{branch.phone}</p>}
            <p className="mt-2 text-xs text-neutral-400">
              {branch._count.doctorBranches} طبيب · {branch._count.staff} موظف
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

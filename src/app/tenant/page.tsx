import { Card } from '@/components/ui/card';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { listBranches } from '@/lib/services/branches';
import { listDoctors } from '@/lib/services/doctors';
import { listStaff } from '@/lib/services/staff';
import { listServices } from '@/lib/services/catalog';

export const dynamic = 'force-dynamic';

export default async function TenantOverviewPage() {
  const [branches, doctors, staff, services] = await runInSessionTenant(() =>
    Promise.all([listBranches(), listDoctors(), listStaff(), listServices()])
  );

  const tiles = [
    { label: 'الفروع', value: branches.length },
    { label: 'الأطباء', value: doctors.length },
    { label: 'الموظفون', value: staff.length },
    { label: 'الخدمات', value: services.length },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">نظرة عامة</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="text-3xl font-bold text-brand-700">{tile.value}</div>
            <div className="mt-1 text-sm text-neutral-600">{tile.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

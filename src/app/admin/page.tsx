import { Card } from '@/components/ui/card';
import { getAdminStats } from '@/lib/services/stats';

export const dynamic = 'force-dynamic';

const TILES: Array<{ key: keyof Awaited<ReturnType<typeof getAdminStats>>; label: string }> = [
  { key: 'totalTenants', label: 'إجمالي الجهات الصحية' },
  { key: 'pendingTenants', label: 'بانتظار التحقق' },
  { key: 'activeTenants', label: 'جهات نشطة' },
  { key: 'suspendedTenants', label: 'جهات موقوفة' },
  { key: 'totalUsers', label: 'إجمالي المستخدمين' },
  { key: 'totalDoctors', label: 'الأطباء' },
  { key: 'totalPatients', label: 'المرضى' },
  { key: 'totalAppointments', label: 'المواعيد' },
];

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">نظرة عامة</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {TILES.map((tile) => (
          <Card key={tile.key}>
            <div className="text-3xl font-bold text-brand-700">{stats[tile.key]}</div>
            <div className="mt-1 text-sm text-neutral-600">{tile.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

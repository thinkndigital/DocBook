import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { getOwnRepresentative, getRepStats, listAssignedTenants } from '@/lib/services/representatives';

export const dynamic = 'force-dynamic';

export default async function RepDashboardPage() {
  const session = await getServerSession(authOptions);
  const rep = await getOwnRepresentative(session!.user.id);

  if (!rep) return <p className="text-neutral-600">لا يوجد ملف مندوب مرتبط بهذا الحساب.</p>;

  const [stats, tenants] = await Promise.all([getRepStats(rep.id), listAssignedTenants(rep.id)]);

  const tiles = [
    { label: 'إجمالي الحجوزات', value: String(stats?.totalBookings ?? 0) },
    { label: 'حجوزات هذا الشهر', value: String(stats?.monthBookings ?? 0) },
    { label: 'مكتملة هذا الشهر', value: String(stats?.monthCompleted ?? 0) },
    { label: 'ملغاة / لم يحضر', value: String(stats?.monthCancelled ?? 0) },
    {
      label: 'إيراد هذا الشهر',
      value: `${((stats?.monthRevenueMinor ?? 0) / 100).toFixed(2)} JOD`,
    },
    {
      label: 'تحقيق الهدف الشهري',
      value: stats?.targetAchievementPct !== null && stats?.targetAchievementPct !== undefined ? `${stats.targetAchievementPct}%` : '—',
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">لوحة الأداء</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <div className="text-2xl font-bold text-brand-700">{tile.value}</div>
            <div className="mt-1 text-sm text-neutral-600">{tile.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">الجهات الصحية المسندة إليك</h2>
        {tenants.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد جهات مسندة بعد — تواصل مع إدارة المنصة.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {tenants.map((t) => (
              <li key={t.id} className="rounded-md bg-neutral-50 px-3 py-2">
                {t.nameAr} · {t._count.branches} فرع · {t._count.doctors} طبيب
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

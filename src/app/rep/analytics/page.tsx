import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveRange } from '@/lib/analytics/range';
import { getRepresentativeAnalytics } from '@/lib/services/analytics';
import { AnalyticsDashboard } from '@/components/analytics/dashboard';

export const dynamic = 'force-dynamic';

export default async function RepAnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await getServerSession(authOptions);
  const range = resolveRange(searchParams.range);
  const data = await getRepresentativeAnalytics(range, session!.user.id);

  if (!data) {
    return (
      <div dir="rtl">
        <p className="text-sm text-neutral-500">لا يوجد ملف مندوب مرتبط بهذا الحساب.</p>
      </div>
    );
  }

  return <AnalyticsDashboard data={data} title="أدائي" basePath="/rep/analytics" locale="ar" />;
}

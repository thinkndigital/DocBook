import { resolveRange } from '@/lib/analytics/range';
import { getPlatformAnalytics } from '@/lib/services/analytics';
import { AnalyticsDashboard } from '@/components/analytics/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Platform analytics. The `/admin` layout already restricts this segment to SUPER_ADMIN,
 * and this page runs with no tenant context — the cross-tenant read is the point.
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const range = resolveRange(searchParams.range);
  const data = await getPlatformAnalytics(range);

  return <AnalyticsDashboard data={data} title="تحليلات المنصة" basePath="/admin/analytics" locale="ar" />;
}

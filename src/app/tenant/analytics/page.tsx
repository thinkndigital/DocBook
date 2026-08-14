import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { resolveRange } from '@/lib/analytics/range';
import { getTenantAnalytics } from '@/lib/services/analytics';
import { AnalyticsDashboard } from '@/components/analytics/dashboard';

export const dynamic = 'force-dynamic';

export default async function TenantAnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await getServerSession(authOptions);
  const tenantId = session!.user.tenantId!;
  const range = resolveRange(searchParams.range);

  const data = await runInSessionTenant(() => getTenantAnalytics(range, tenantId));

  return (
    <AnalyticsDashboard
      data={data}
      title="التحليلات"
      basePath="/tenant/analytics"
      locale="ar"
      exportPath="/api/v1/tenant/analytics/export"
    />
  );
}

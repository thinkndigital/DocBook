import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { resolveRange } from '@/lib/analytics/range';
import { getTenantAnalytics } from '@/lib/services/analytics';

export const dynamic = 'force-dynamic';

/**
 * Tenant analytics. The tenant id passed to the service comes from the verified session
 * (`user.tenantId`), never from the request — the raw time-series SQL takes it as an
 * explicit parameter with no middleware behind it, so this is the boundary that matters.
 * See the warning at the top of `src/lib/analytics/series.ts`.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['analytics:read_tenant', 'report:read_tenant'], async (user) => {
    const range = resolveRange(new URL(req.url).searchParams.get('range'));
    return okResponse(await getTenantAnalytics(range, user.tenantId));
  });
}

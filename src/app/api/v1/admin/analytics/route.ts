import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { resolveRange } from '@/lib/analytics/range';
import { getPlatformAnalytics } from '@/lib/services/analytics';

export const dynamic = 'force-dynamic';

/**
 * Platform-wide analytics. `analytics:read_tenant` is a TENANT_ADMIN permission, so this
 * route deliberately requires `tenant:manage_all` — the permission only SUPER_ADMIN holds.
 * Cross-tenant reads run with no tenant context at all, matching every other
 * `/api/v1/admin/*` route.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:manage_all', async () => {
    const range = resolveRange(new URL(req.url).searchParams.get('range'));
    return okResponse(await getPlatformAnalytics(range));
  });
}

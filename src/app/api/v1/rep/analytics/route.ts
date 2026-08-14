import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { resolveRange } from '@/lib/analytics/range';
import { getRepresentativeAnalytics } from '@/lib/services/analytics';

export const dynamic = 'force-dynamic';

/**
 * A representative's own performance. Uses `performance:read_own`, which representatives
 * hold and no other role does — a rep sees their own bookings and commissions, never a
 * clinic's aggregate revenue or attendance patterns (that is `ai:clinic_insights` /
 * `analytics:read_tenant`, both structurally absent from the REPRESENTATIVE list).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'performance:read_own', async (user) => {
    const range = resolveRange(new URL(req.url).searchParams.get('range'));
    const result = await getRepresentativeAnalytics(range, user.id);
    if (!result) return errorResponse('REPRESENTATIVE_NOT_FOUND', 'No representative profile for this account.', 404);
    return okResponse(result);
  });
}

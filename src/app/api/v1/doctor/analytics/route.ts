import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { resolveRange } from '@/lib/analytics/range';
import { getDoctorAnalytics } from '@/lib/services/analytics';

export const dynamic = 'force-dynamic';

/** A doctor's own numbers. The doctor row is resolved from the session user, not from input. */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'analytics:read_own', async (user) => {
    const range = resolveRange(new URL(req.url).searchParams.get('range'));
    const result = await getDoctorAnalytics(range, user.id);
    if (!result) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse(result);
  });
}

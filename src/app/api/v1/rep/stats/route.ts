import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getOwnRepresentative, getRepStats } from '@/lib/services/representatives';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'performance:read_own', async (user) => {
    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);
    const stats = await getRepStats(rep.id);
    return okResponse(stats);
  });
}

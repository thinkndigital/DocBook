import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getOwnRepresentative } from '@/lib/services/representatives';
import { listRepCommissions } from '@/lib/services/commissions';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'commission:read_own', async (user) => {
    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);
    return okResponse(await listRepCommissions(rep.id));
  });
}

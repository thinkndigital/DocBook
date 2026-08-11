import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getOwnRepresentative, listAssignedTenants } from '@/lib/services/representatives';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative_account:manage_assigned', async (user) => {
    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);
    return okResponse(await listAssignedTenants(rep.id));
  });
}

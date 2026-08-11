import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getOwnRepresentative, listRepBookableDoctors } from '@/lib/services/representatives';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'doctor:search', async (user) => {
    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? undefined;
    return okResponse(await listRepBookableDoctors(rep.id, tenantId));
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { searchUsersAdmin } from '@/lib/services/admin-ops';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'user:read_all', async () => {
    const query = req.nextUrl.searchParams.get('query') ?? '';
    return okResponse(await searchUsersAdmin(query));
  });
}

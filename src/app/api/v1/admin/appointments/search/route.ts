import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { searchAppointmentsAdmin } from '@/lib/services/admin-ops';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:read_all', async () => {
    const query = req.nextUrl.searchParams.get('query') ?? '';
    return okResponse(await searchAppointmentsAdmin(query));
  });
}

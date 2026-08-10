import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { getAdminStats } from '@/lib/services/stats';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'system_setting:manage', async () => okResponse(await getAdminStats()));
}

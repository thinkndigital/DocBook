import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getTenant } from '@/lib/services/tenants';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:manage_all', async () => {
    const tenant = await getTenant(params.id);
    if (!tenant) return errorResponse('TENANT_NOT_FOUND', 'No tenant with that id.', 404);
    return okResponse(tenant);
  });
}

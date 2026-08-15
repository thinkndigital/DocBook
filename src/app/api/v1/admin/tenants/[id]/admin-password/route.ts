import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { adminSetPasswordSchema } from '@/lib/validation/security';
import { resetTenantAdminPassword } from '@/lib/services/tenants';

export const dynamic = 'force-dynamic';

/** SUPER_ADMIN resets a tenant's admin-user password. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:manage_all', async (user) => {
    try {
      const body = await parseBody(req, adminSetPasswordSchema);
      const ok = await resetTenantAdminPassword(params.id, body.newPassword, user);
      if (!ok) return errorResponse('TENANT_ADMIN_NOT_FOUND', 'This tenant has no admin user.', 404);
      return okResponse({ reset: true });
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

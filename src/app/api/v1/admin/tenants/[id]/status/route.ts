import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { tenantStatusSchema } from '@/lib/validation/admin';
import { setTenantStatus, InvalidStatusTransitionError } from '@/lib/services/tenants';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:verify', async (user) => {
    try {
      const body = await parseBody(req, tenantStatusSchema);
      const updated = await setTenantStatus(params.id, body.status, body.reason, user);
      if (!updated) return errorResponse('TENANT_NOT_FOUND', 'No tenant with that id.', 404);
      return okResponse(updated);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof InvalidStatusTransitionError) {
        return errorResponse('INVALID_STATUS_TRANSITION', err.message, 409);
      }
      throw err;
    }
  });
}

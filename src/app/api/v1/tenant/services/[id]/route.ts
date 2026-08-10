import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateServiceSchema } from '@/lib/validation/tenant';
import { updateService } from '@/lib/services/catalog';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'service:manage', async (user) => {
    try {
      const body = await parseBody(req, updateServiceSchema);
      const service = await updateService(params.id, body, user);
      if (!service) return errorResponse('SERVICE_NOT_FOUND', 'No service with that id.', 404);
      return okResponse(service);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { repAssignmentSchema } from '@/lib/validation/representative';
import { assignTenantToRep, unassignTenantFromRep, RepNotFoundError } from '@/lib/services/representatives';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative:manage', async (user) => {
    try {
      const body = await parseBody(req, repAssignmentSchema);
      const assignment = await assignTenantToRep(params.id, body.tenantId, user);
      return okResponse(assignment, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof RepNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
      throw err;
    }
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative:manage', async (user) => {
    try {
      const body = await parseBody(req, repAssignmentSchema);
      await unassignTenantFromRep(params.id, body.tenantId, user);
      return okResponse({ removed: true });
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

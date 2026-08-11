import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createRepresentativeSchema } from '@/lib/validation/representative';
import { createRepresentative, listRepresentatives, RepConflictError } from '@/lib/services/representatives';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative:manage', async () => okResponse(await listRepresentatives()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative:manage', async (user) => {
    try {
      const body = await parseBody(req, createRepresentativeSchema);
      const rep = await createRepresentative(body, user);
      return okResponse(rep, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof RepConflictError) return errorResponse('REP_EMAIL_TAKEN', err.message, 409);
      throw err;
    }
  });
}

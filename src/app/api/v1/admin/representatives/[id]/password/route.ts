import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { adminSetPasswordSchema } from '@/lib/validation/security';
import { resetRepresentativePassword } from '@/lib/services/representatives';

export const dynamic = 'force-dynamic';

/** SUPER_ADMIN resets a representative's password. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'representative:manage', async (user) => {
    try {
      const body = await parseBody(req, adminSetPasswordSchema);
      const ok = await resetRepresentativePassword(params.id, body.newPassword, user);
      if (!ok) return errorResponse('REPRESENTATIVE_NOT_FOUND', 'No representative with that id.', 404);
      return okResponse({ reset: true });
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { adminSetPasswordSchema } from '@/lib/validation/security';
import { resetStaffPassword } from '@/lib/services/staff';

export const dynamic = 'force-dynamic';

/** Tenant admin resets a receptionist/staff password. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'staff:manage', async (user) => {
    try {
      const body = await parseBody(req, adminSetPasswordSchema);
      const ok = await resetStaffPassword(params.id, body.newPassword, user);
      if (!ok) return errorResponse('STAFF_NOT_FOUND', 'No staff member with that id.', 404);
      return okResponse({ reset: true });
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

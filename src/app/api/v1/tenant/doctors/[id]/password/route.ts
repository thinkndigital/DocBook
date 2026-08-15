import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { adminSetPasswordSchema } from '@/lib/validation/security';
import { resetDoctorPassword } from '@/lib/services/doctors';

export const dynamic = 'force-dynamic';

/** Tenant admin resets a doctor's password — see src/lib/services/password.ts. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'doctor:manage', async (user) => {
    try {
      const body = await parseBody(req, adminSetPasswordSchema);
      const ok = await resetDoctorPassword(params.id, body.newPassword, user);
      if (!ok) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);
      return okResponse({ reset: true });
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

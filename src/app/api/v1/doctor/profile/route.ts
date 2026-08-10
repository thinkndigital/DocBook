import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateOwnDoctorProfileSchema } from '@/lib/validation/doctor';
import { getOwnDoctorProfile, updateOwnDoctorProfile } from '@/lib/services/doctors';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'doctor_profile:update_own', async (user) => {
    const profile = await getOwnDoctorProfile(user.id);
    if (!profile) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse(profile);
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'doctor_profile:update_own', async (user) => {
    try {
      const body = await parseBody(req, updateOwnDoctorProfileSchema);
      const profile = await updateOwnDoctorProfile(user.id, body, user);
      if (!profile) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
      return okResponse(profile);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

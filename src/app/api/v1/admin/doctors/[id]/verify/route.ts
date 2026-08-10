import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { verifyDoctorSchema } from '@/lib/validation/doctor';
import { verifyDoctor } from '@/lib/services/doctors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'doctor:verify', async (user) => {
    try {
      const body = await parseBody(req, verifyDoctorSchema);
      const doctor = await verifyDoctor(params.id, body, user);
      if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);
      return okResponse(doctor);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateDoctorSchema } from '@/lib/validation/tenant';
import { getDoctor, updateDoctor, InvalidBranchError } from '@/lib/services/doctors';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'doctor:manage', async () => {
    const doctor = await getDoctor(params.id);
    if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);
    return okResponse(doctor);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'doctor:manage', async (user) => {
    try {
      const body = await parseBody(req, updateDoctorSchema);
      const doctor = await updateDoctor(params.id, body, user);
      if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);
      return okResponse(doctor);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
      throw err;
    }
  });
}

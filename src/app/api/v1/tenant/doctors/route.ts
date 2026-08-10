import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createDoctorSchema } from '@/lib/validation/tenant';
import { listDoctors, createDoctor, DoctorConflictError, InvalidBranchError } from '@/lib/services/doctors';

export async function GET() {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'doctor:manage', async () => okResponse(await listDoctors()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'doctor:manage', async (user) => {
    try {
      const body = await parseBody(req, createDoctorSchema);
      const doctor = await createDoctor(body, user);
      return okResponse(doctor, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof DoctorConflictError) return errorResponse('DOCTOR_EMAIL_TAKEN', err.message, 409);
      if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
      throw err;
    }
  });
}

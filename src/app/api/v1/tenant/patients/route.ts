import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { registerPatientSchema } from '@/lib/validation/patient';
import { findPatientByEmail, registerPatient, PatientConflictError } from '@/lib/services/patients';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['patient:register', 'appointment:manage_tenant'], async () => {
    const email = req.nextUrl.searchParams.get('email');
    if (!email) return errorResponse('MISSING_PARAMS', 'email query param is required.', 400);
    const patient = await findPatientByEmail(email);
    return okResponse(patient);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['patient:register', 'appointment:manage_tenant'], async (user) => {
    try {
      const body = await parseBody(req, registerPatientSchema);
      const patient = await registerPatient(body, user);
      return okResponse(patient, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof PatientConflictError) return errorResponse('PATIENT_EMAIL_TAKEN', err.message, 409);
      throw err;
    }
  });
}

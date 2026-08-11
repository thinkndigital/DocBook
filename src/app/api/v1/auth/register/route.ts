import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { selfRegisterPatientSchema } from '@/lib/validation/patient';
import { selfRegisterPatient, PatientConflictError } from '@/lib/services/patients';

/** Public — no session required. Anyone can create a patient account for themselves. */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, selfRegisterPatientSchema);
    const patient = await selfRegisterPatient(body);
    return NextResponse.json({ data: { id: patient.id, email: patient.user.email } }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof PatientConflictError) return errorResponse('EMAIL_TAKEN', err.message, 409);
    throw err;
  }
}

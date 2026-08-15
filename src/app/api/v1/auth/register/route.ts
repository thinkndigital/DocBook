import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { selfRegisterPatientSchema } from '@/lib/validation/patient';
import { selfRegisterPatient, PatientConflictError } from '@/lib/services/patients';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Public — no session required. Anyone can create a patient account for themselves. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.register, subjectKey('register-patient', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
  }

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

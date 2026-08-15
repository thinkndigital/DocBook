import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { selfRegisterDoctorSchema } from '@/lib/validation/self-register';
import { selfRegisterDoctor, DoctorConflictError, InvalidBranchError, InvalidInviteCodeError } from '@/lib/services/doctors';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public — a doctor creating their own login, either joining a real clinic by invite code
 * or standing up a solo practice. See `selfRegisterDoctor` for why exactly one of those two
 * is required and what "verified" does and doesn't gate.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.register, subjectKey('register-doctor', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
  }

  try {
    const body = await parseBody(req, selfRegisterDoctorSchema);
    const doctor = await selfRegisterDoctor(body);
    return NextResponse.json({ data: { id: doctor.id, email: doctor.user.email } }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof DoctorConflictError) return errorResponse('EMAIL_TAKEN', err.message, 409);
    if (err instanceof InvalidInviteCodeError) return errorResponse('INVALID_INVITE_CODE', err.message, 400);
    if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
    throw err;
  }
}

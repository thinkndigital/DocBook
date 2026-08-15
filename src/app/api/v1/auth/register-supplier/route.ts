import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { selfRegisterSupplierSchema } from '@/lib/validation/equipment';
import { selfRegisterSupplier, SupplierConflictError } from '@/lib/services/suppliers';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Public — a medical equipment manufacturer/distributor creating its own login. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.register, subjectKey('register-supplier', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
  }

  try {
    const body = await parseBody(req, selfRegisterSupplierSchema);
    const result = await selfRegisterSupplier(body);
    return NextResponse.json({ data: { id: result.supplier.id, email: result.user.email } }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof SupplierConflictError) return errorResponse('EMAIL_TAKEN', err.message, 409);
    throw err;
  }
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { selfRegisterTenantSchema } from '@/lib/validation/self-register';
import { selfRegisterTenant, TenantConflictError } from '@/lib/services/tenants';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Public — a clinic/hospital creating its own tenant + first admin login, no approval step. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.register, subjectKey('register-tenant', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
  }

  try {
    const body = await parseBody(req, selfRegisterTenantSchema);
    const result = await selfRegisterTenant(body);
    return NextResponse.json(
      { data: { tenantId: result.tenant.id, email: result.adminUser.email } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof TenantConflictError) return errorResponse('EMAIL_TAKEN', err.message, 409);
    throw err;
  }
}

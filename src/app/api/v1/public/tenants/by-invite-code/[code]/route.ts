import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { findTenantByInviteCode } from '@/lib/services/tenants';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public — a doctor typing their clinic's invite code into the registration form needs to
 * see which clinic it resolves to (and pick a branch) before submitting. Rate-limited on
 * the public-api ceiling: an 8-character code from a 33-symbol alphabet is not brute-
 * forceable within that budget, but there's no reason to leave it unmetered either.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.publicApi, subjectKey('invite-code-lookup', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Please try again later.', 429);
  }

  const tenant = await findTenantByInviteCode(params.code);
  if (!tenant) return errorResponse('NOT_FOUND', 'No clinic matches this invite code.', 404);

  return okResponse({
    id: tenant.id,
    name: tenant.name,
    nameAr: tenant.nameAr,
    branches: tenant.branches,
  });
}

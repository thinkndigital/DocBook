import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { submitPartnerApplicationSchema } from '@/lib/validation/partner';
import { submitPartnerApplication, UnknownCountryError } from '@/lib/services/partner-applications';
import { checkLimit, RATE_LIMITS, subjectKey, clientIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public — a clinic asking to join, with no account and no session.
 *
 * The response is deliberately the same shape whatever happened downstream: `{ received }`.
 * It carries no application id, because the submitter has nothing to do with one and an
 * identifier handed to an anonymous caller is an identifier they can probe with.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const verdict = await checkLimit(RATE_LIMITS.partnerApplication, subjectKey('partner', ip));
  if (!verdict.allowed) {
    return errorResponse('RATE_LIMITED', 'Too many submissions. Please try again later.', 429);
  }

  try {
    const body = await parseBody(req, submitPartnerApplicationSchema);
    await submitPartnerApplication(body);
    return okResponse({ received: true }, 201);
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof UnknownCountryError) {
      return errorResponse('UNKNOWN_COUNTRY', 'Select a country from the list.', 400);
    }
    throw err;
  }
}

import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { triageSchema } from '@/lib/validation/ai';
import { getSessionUser } from '@/lib/api/session';
import { actorKeyForIp, actorKeyForUser, clientIpFrom } from '@/lib/ai/usage';
import { RateLimitedError, runSymptomTriage } from '@/lib/services/ai-triage';

export const dynamic = 'force-dynamic';

/**
 * Public symptom triage. Unauthenticated on purpose — the whole point is that someone can
 * describe symptoms and find the right kind of doctor before they have an account, which
 * is the marketplace's acquisition path (brief §5/§19).
 *
 * The cost of being public is abuse, handled two ways: a per-IP rate limit (hashed, see
 * `usage.ts`) and a hard input cap in the schema. A logged-in caller is limited by user id
 * instead, so sharing an office IP doesn't exhaust one person's budget for the building.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(req, triageSchema);
    const session = await getSessionUser();
    const actorKey = session ? actorKeyForUser(session.id) : actorKeyForIp(clientIpFrom(req.headers));

    const result = await runSymptomTriage({
      symptomText: body.symptomText,
      locale: body.locale,
      actorKey,
      userId: session?.id ?? null,
      ...(body.cityId ? { cityId: body.cityId } : {}),
    });
    return okResponse(result);
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof RateLimitedError) {
      const response = errorResponse(
        'RATE_LIMITED',
        'Too many symptom checks. Please wait before trying again.',
        429
      );
      response.headers.set('Retry-After', String(err.retryAfterSeconds));
      return response;
    }
    throw err;
  }
}

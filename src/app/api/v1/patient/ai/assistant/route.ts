import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { assistantSchema } from '@/lib/validation/ai';
import { actorKeyForUser } from '@/lib/ai/usage';
import { askPatientAssistant } from '@/lib/services/ai-assistant';
import { RateLimitedError } from '@/lib/services/ai-triage';

export const dynamic = 'force-dynamic';

/**
 * Patient assistant. Rate-limited by user id, and the context it can see is built from the
 * caller's own patient record only — `buildPatientContext` resolves the patient from
 * `user.id`, so there is no id in the request body that could be pointed at someone else.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'ai:assistant', async (user) => {
    try {
      const body = await parseBody(req, assistantSchema);
      const result = await askPatientAssistant({
        question: body.question,
        locale: body.locale,
        userId: user.id,
        actorKey: actorKeyForUser(user.id),
      });
      return okResponse(result);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof RateLimitedError) {
        const response = errorResponse('RATE_LIMITED', 'Too many assistant questions. Please wait before trying again.', 429);
        response.headers.set('Retry-After', String(err.retryAfterSeconds));
        return response;
      }
      throw err;
    }
  });
}

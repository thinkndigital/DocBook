import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { twoFactorCodeSchema } from '@/lib/validation/security';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFactor,
  twoFactorStatus,
  TwoFactorError,
  TwoFactorRateLimitedError,
} from '@/lib/services/two-factor';

export const dynamic = 'force-dynamic';

/**
 * Two-factor enrollment for the signed-in account.
 *
 * Every operation acts on the session's own user id. There is no `userId` parameter
 * anywhere in this route, so an administrator cannot enrol, inspect, or strip another
 * person's second factor through it — that would be an account-takeover primitive wearing
 * an admin badge.
 */

/** Current status. Never returns the secret or the backup codes. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in first.', 401);
  return okResponse(await twoFactorStatus(session.id));
}

/** Step 1: generate a secret and the otpauth URI. Does not enable anything yet. */
export async function POST() {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in first.', 401);

  try {
    return okResponse(await beginEnrollment(session.id));
  } catch (err) {
    if (err instanceof TwoFactorError) return errorResponse('TWO_FACTOR_ERROR', err.message, 409);
    throw err;
  }
}

/** Step 2: prove the authenticator works, which is what actually enables it. */
export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in first.', 401);

  try {
    const body = await parseBody(req, twoFactorCodeSchema);
    return okResponse(await confirmEnrollment(session.id, body.code));
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof TwoFactorRateLimitedError) {
      const response = errorResponse('RATE_LIMITED', 'Too many attempts. Wait before trying again.', 429);
      response.headers.set('Retry-After', String(err.retryAfterSeconds));
      return response;
    }
    if (err instanceof TwoFactorError) return errorResponse('TWO_FACTOR_ERROR', err.message, 400);
    throw err;
  }
}

/** Turning it off requires a currently-valid factor. */
export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in first.', 401);

  try {
    const body = await parseBody(req, twoFactorCodeSchema);
    await disableTwoFactor(session.id, body.code);
    return okResponse({ enabled: false });
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof TwoFactorRateLimitedError) {
      const response = errorResponse('RATE_LIMITED', 'Too many attempts. Wait before trying again.', 429);
      response.headers.set('Retry-After', String(err.retryAfterSeconds));
      return response;
    }
    if (err instanceof TwoFactorError) return errorResponse('TWO_FACTOR_ERROR', err.message, 400);
    throw err;
  }
}

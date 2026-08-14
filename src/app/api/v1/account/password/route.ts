import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { changePasswordSchema } from '@/lib/validation/security';
import { changeOwnPassword, PasswordChangeError } from '@/lib/services/password';

export const dynamic = 'force-dynamic';

/**
 * Change the signed-in account's own password.
 *
 * There is deliberately no `userId` parameter: the target is always the session's own user.
 * A route that could set someone else's password is an account-takeover primitive, and an
 * admin who needs to help a locked-out colleague should be re-issuing an assigned password
 * through the flagged-account flow, not choosing a secret on their behalf.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in first.', 401);

  try {
    const body = await parseBody(req, changePasswordSchema);
    await changeOwnPassword(session.id, body.currentPassword, body.newPassword);
    return okResponse({ changed: true });
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof PasswordChangeError) {
      // 400 for every case, including a wrong current password: this endpoint requires an
      // authenticated session, so there is no account to enumerate, and a distinct status
      // would only help a script tell "wrong password" from "rejected new password".
      return errorResponse(err.code, err.message, 400);
    }
    throw err;
  }
}

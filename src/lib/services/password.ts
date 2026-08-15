import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import { resolveInitialPassword } from '@/lib/services/account-provisioning';
import type { SessionUser } from '@/lib/auth';

export class PasswordChangeError extends Error {
  constructor(
    readonly code: 'INVALID_CURRENT_PASSWORD' | 'SAME_AS_ASSIGNED' | 'SAME_AS_CURRENT',
    message: string
  ) {
    super(message);
  }
}

/**
 * Change one's own password.
 *
 * Always requires the current password, including when `mustChangePassword` is set. It is
 * tempting to skip that check for a first login — the user just proved themselves at the
 * sign-in screen — but the whole premise of the flag is that the current password is a
 * value published in this repository. Skipping the check would let anyone who reached a
 * session (a shared device, a session left open at a reception desk) set a new password
 * without knowing anything, which is a worse door than the one being closed.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, tenantId: true },
  });
  if (!user) throw new PasswordChangeError('INVALID_CURRENT_PASSWORD', 'Account not found.');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new PasswordChangeError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
  }

  // The one value that must never become a "new" password: it is in the repository.
  if (newPassword === DEFAULT_ASSIGNED_PASSWORD) {
    throw new PasswordChangeError(
      'SAME_AS_ASSIGNED',
      'That is the default assigned password. Choose a different one.'
    );
  }

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new PasswordChangeError('SAME_AS_CURRENT', 'The new password matches the current one.');
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
  });

  // Records that a change happened. Never the password, old or new — see SECURITY.md.
  await recordAudit({
    actorUserId: user.id,
    tenantId: user.tenantId ?? null,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: user.id,
  });
}

/**
 * An admin setting (or resetting) someone else's password.
 *
 * This is the "forgot password" path. There is no self-service reset, because no email
 * channel is configured (`EMAIL_PROVIDER=dev` only logs) — a reset flow that cannot
 * deliver a code would lock people out rather than in. So a user who forgot their password
 * asks whoever manages their account, and that person uses this.
 *
 * Two modes, same choice as account creation (`resolveInitialPassword`):
 *  - A password typed here becomes the account's real password immediately
 *    (`mustChangePassword: false`) — the admin is expected to hand it to the user directly,
 *    the same way they would over the phone.
 *  - Left blank, the account is reset to `DEFAULT_ASSIGNED_PASSWORD` and flagged
 *    `mustChangePassword: true`, exactly like a fresh account.
 *
 * Callers are responsible for authorization and for resolving `targetUserId` through a
 * tenant-scoped lookup (a `Doctor`/`Staff` row) when the caller is a `TENANT_ADMIN` — this
 * function does not re-check tenant ownership, the same way `updateDoctor` doesn't.
 */
export async function adminSetUserPassword(
  targetUserId: string,
  newPassword: string | undefined,
  actor: SessionUser
): Promise<void> {
  const { passwordHash, mustChangePassword } = await resolveInitialPassword(newPassword);

  await db.user.update({
    where: { id: targetUserId },
    data: { passwordHash, mustChangePassword },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId ?? null,
    action: 'PASSWORD_RESET_BY_ADMIN',
    entityType: 'User',
    entityId: targetUserId,
  });
}

import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';

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

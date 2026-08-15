import bcrypt from 'bcryptjs';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';

/**
 * How a newly created account's password is decided.
 *
 * Two paths, both legitimate:
 *
 * - The creator (admin, tenant admin) types a password themselves and communicates it to
 *   the new user out of band (phone call, in person, a chat message). That password is not
 *   published anywhere, so there is nothing for `mustChangePassword` to protect against —
 *   forcing a change would just be friction on a secret nobody else knows.
 * - The creator leaves it blank and the account gets `DEFAULT_ASSIGNED_PASSWORD`, which
 *   *is* published in this repository. `mustChangePassword` exists specifically for this
 *   path: the account is blocked from everything except changing it until the user picks
 *   their own secret.
 *
 * This is the single place that decision is made, so every creation path (doctor, staff,
 * representative, tenant admin) applies the same rule rather than each reimplementing it
 * slightly differently.
 */
export async function resolveInitialPassword(
  customPassword: string | undefined
): Promise<{ passwordHash: string; mustChangePassword: boolean }> {
  if (customPassword) {
    return { passwordHash: await bcrypt.hash(customPassword, 12), mustChangePassword: false };
  }
  return { passwordHash: await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12), mustChangePassword: true };
}

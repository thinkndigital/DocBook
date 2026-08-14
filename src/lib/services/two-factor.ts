import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { encryptField, decryptField } from '@/lib/crypto/field-encryption';
import {
  generateBackupCodes,
  generateSecret,
  normalizeBackupCode,
  otpauthUri,
  verifyTotp,
} from '@/lib/security/totp';
import { RATE_LIMITS, checkLimit, clearFailures, recordAttempt, subjectKey } from '@/lib/security/rate-limit';

export class TwoFactorError extends Error {}
export class TwoFactorRateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Too many verification attempts.');
  }
}

/**
 * Two-factor enrollment and verification.
 *
 * Three decisions worth stating:
 *
 * 1. **The secret is encrypted at rest** with the same AES-256-GCM field encryption used
 *    for clinical narrative. A TOTP secret is not a password hash — it is a *symmetric*
 *    key, so a plaintext copy in the database lets anyone who reads a backup generate
 *    valid codes forever. Encrypting it means a leaked dump does not hand over the second
 *    factor alongside the first.
 * 2. **Enrollment is two-step.** The secret is stored but `twoFactorEnabled` stays false
 *    until the user proves they can produce a code from it. Enabling on generation would
 *    lock out anyone whose phone failed to scan, and they would find out at their next
 *    login rather than during setup.
 * 3. **Backup codes are single-use and bcrypt-hashed**, consumed by removing the matching
 *    hash. They are password-equivalent.
 */

export interface EnrollmentChallenge {
  secret: string;
  otpauthUri: string;
}

export async function beginEnrollment(userId: string): Promise<EnrollmentChallenge> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, twoFactorEnabled: true } });
  if (!user) throw new TwoFactorError('User not found.');
  if (user.twoFactorEnabled) throw new TwoFactorError('Two-factor authentication is already enabled.');

  const secret = generateSecret();

  // Stored immediately but NOT enabled — see (2) above.
  await db.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptField(secret), twoFactorEnabled: false },
  });

  return { secret, otpauthUri: otpauthUri(secret, user.email) };
}

/**
 * Completes enrollment. Returns the backup codes in the clear — the only time they are
 * ever visible — and stores only their hashes.
 */
export async function confirmEnrollment(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true, tenantId: true },
  });
  if (!user?.twoFactorSecret) throw new TwoFactorError('Start enrollment before confirming it.');
  if (user.twoFactorEnabled) throw new TwoFactorError('Two-factor authentication is already enabled.');

  const key = subjectKey('2fa-enroll', userId);
  const verdict = await checkLimit(RATE_LIMITS.twoFactor, key);
  if (!verdict.allowed) throw new TwoFactorRateLimitedError(verdict.retryAfterSeconds);

  const secret = decryptField(user.twoFactorSecret);
  if (!verifyTotp(secret, code)) {
    await recordAttempt(RATE_LIMITS.twoFactor, key, false);
    throw new TwoFactorError('That code is not valid. Check your authenticator and try again.');
  }

  const backupCodes = generateBackupCodes();
  const hashes = await Promise.all(backupCodes.map((c) => bcrypt.hash(normalizeBackupCode(c), 12)));

  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: hashes, twoFactorEnrolledAt: new Date() },
  });
  await clearFailures(RATE_LIMITS.twoFactor, key);

  await recordAudit({
    actorUserId: userId,
    tenantId: user.tenantId,
    action: 'TWO_FACTOR_ENABLED',
    entityType: 'User',
    entityId: userId,
  });

  return { backupCodes };
}

/**
 * Verifies a login-time code. Accepts either a TOTP code or an unused backup code.
 *
 * A consumed backup code is deleted, not marked — there is no state in which a used
 * recovery code can be replayed.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true, tenantId: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return true; // 2FA not in play for this account.

  const key = subjectKey('2fa-login', userId);
  const verdict = await checkLimit(RATE_LIMITS.twoFactor, key);
  if (!verdict.allowed) throw new TwoFactorRateLimitedError(verdict.retryAfterSeconds);

  if (verifyTotp(decryptField(user.twoFactorSecret), code)) {
    await clearFailures(RATE_LIMITS.twoFactor, key);
    return true;
  }

  const normalized = normalizeBackupCode(code);
  for (const hash of user.twoFactorBackupCodes) {
    if (await bcrypt.compare(normalized, hash)) {
      await db.user.update({
        where: { id: userId },
        data: { twoFactorBackupCodes: user.twoFactorBackupCodes.filter((h) => h !== hash) },
      });
      await clearFailures(RATE_LIMITS.twoFactor, key);
      await recordAudit({
        actorUserId: userId,
        tenantId: user.tenantId,
        action: 'TWO_FACTOR_BACKUP_CODE_USED',
        entityType: 'User',
        entityId: userId,
        // Count only — never which code, and never the code itself.
        afterState: { remainingBackupCodes: user.twoFactorBackupCodes.length - 1 },
      });
      return true;
    }
  }

  await recordAttempt(RATE_LIMITS.twoFactor, key, false);
  return false;
}

export async function disableTwoFactor(userId: string, code: string): Promise<void> {
  // Disabling requires a valid current factor. Otherwise anyone with a hijacked session
  // could strip the protection that session was supposed to be gated on.
  if (!(await verifySecondFactor(userId, code))) {
    throw new TwoFactorError('That code is not valid.');
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [], twoFactorEnrolledAt: null },
  });

  await recordAudit({
    actorUserId: userId,
    tenantId: user?.tenantId ?? null,
    action: 'TWO_FACTOR_DISABLED',
    entityType: 'User',
    entityId: userId,
  });
}

export async function twoFactorStatus(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorEnrolledAt: true, twoFactorBackupCodes: true },
  });
  return {
    enabled: user?.twoFactorEnabled ?? false,
    enrolledAt: user?.twoFactorEnrolledAt ?? null,
    backupCodesRemaining: user?.twoFactorBackupCodes.length ?? 0,
  };
}

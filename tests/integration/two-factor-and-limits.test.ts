import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { totp } from '@/lib/security/totp';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTwoFactor,
  twoFactorStatus,
  verifySecondFactor,
  TwoFactorError,
} from '@/lib/services/two-factor';
import { RATE_LIMITS, checkLimit, clearFailures, recordAttempt, subjectKey } from '@/lib/security/rate-limit';
import { createWorld, cleanupWorld, type TestWorld } from './factories';

let world: TestWorld;

beforeAll(async () => {
  world = await createWorld('2fa');
});

afterAll(async () => {
  await db.rateLimitHit.deleteMany({ where: { bucket: { in: ['login', '2fa'] } } });
  await cleanupWorld(world);
});

describe('two-factor enrollment', () => {
  beforeEach(async () => {
    await db.user.update({
      where: { id: world.staffSession.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [], twoFactorEnrolledAt: null },
    });
    await db.rateLimitHit.deleteMany({ where: { bucket: '2fa' } });
  });

  it('does not enable 2FA until a code proves the authenticator works', async () => {
    const { secret, otpauthUri } = await beginEnrollment(world.staffSession.id);

    expect(otpauthUri).toContain('otpauth://totp/');
    // Still off — a phone that failed to scan must not lock the user out at next login.
    expect((await twoFactorStatus(world.staffSession.id)).enabled).toBe(false);

    const { backupCodes } = await confirmEnrollment(world.staffSession.id, totp(secret));

    const status = await twoFactorStatus(world.staffSession.id);
    expect(status.enabled).toBe(true);
    expect(status.backupCodesRemaining).toBe(backupCodes.length);
    expect(backupCodes).toHaveLength(10);
  });

  it('stores the secret encrypted, never in the clear', async () => {
    const { secret } = await beginEnrollment(world.staffSession.id);

    const row = await db.user.findUnique({
      where: { id: world.staffSession.id },
      select: { twoFactorSecret: true },
    });

    // A TOTP secret is a symmetric key: plaintext in a backup means valid codes forever.
    expect(row?.twoFactorSecret).not.toBe(secret);
    expect(row?.twoFactorSecret).not.toContain(secret);
    expect(row?.twoFactorSecret?.startsWith('v1:')).toBe(true);
  });

  it('never stores backup codes in the clear', async () => {
    const { secret } = await beginEnrollment(world.staffSession.id);
    const { backupCodes } = await confirmEnrollment(world.staffSession.id, totp(secret));

    const row = await db.user.findUnique({
      where: { id: world.staffSession.id },
      select: { twoFactorBackupCodes: true },
    });

    for (const code of backupCodes) {
      expect(row!.twoFactorBackupCodes).not.toContain(code);
    }
    expect(row!.twoFactorBackupCodes.every((h) => h.startsWith('$2'))).toBe(true);
  });

  it('rejects a wrong confirmation code', async () => {
    await beginEnrollment(world.staffSession.id);
    await expect(confirmEnrollment(world.staffSession.id, '000000')).rejects.toBeInstanceOf(TwoFactorError);
    expect((await twoFactorStatus(world.staffSession.id)).enabled).toBe(false);
  });
});

describe('two-factor verification', () => {
  let secret: string;
  let backupCodes: string[];

  beforeEach(async () => {
    await db.user.update({
      where: { id: world.staffSession.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    });
    await db.rateLimitHit.deleteMany({ where: { bucket: '2fa' } });

    const enrollment = await beginEnrollment(world.staffSession.id);
    secret = enrollment.secret;
    ({ backupCodes } = await confirmEnrollment(world.staffSession.id, totp(secret)));
  });

  it('accepts a valid TOTP code and rejects a wrong one', async () => {
    expect(await verifySecondFactor(world.staffSession.id, totp(secret))).toBe(true);
    expect(await verifySecondFactor(world.staffSession.id, '000000')).toBe(false);
  });

  it('consumes a backup code exactly once', async () => {
    const code = backupCodes[0]!;

    expect(await verifySecondFactor(world.staffSession.id, code)).toBe(true);
    // Replay must fail — a used recovery code is deleted, not flagged.
    expect(await verifySecondFactor(world.staffSession.id, code)).toBe(false);

    expect((await twoFactorStatus(world.staffSession.id)).backupCodesRemaining).toBe(backupCodes.length - 1);
  });

  it('accepts backup codes regardless of casing or the separator', async () => {
    const code = backupCodes[1]!;
    expect(await verifySecondFactor(world.staffSession.id, code.toLowerCase().replace('-', ' '))).toBe(true);
  });

  it('requires a valid factor before 2FA can be switched off', async () => {
    await expect(disableTwoFactor(world.staffSession.id, '000000')).rejects.toBeInstanceOf(TwoFactorError);
    expect((await twoFactorStatus(world.staffSession.id)).enabled).toBe(true);

    await disableTwoFactor(world.staffSession.id, totp(secret));
    const status = await twoFactorStatus(world.staffSession.id);
    expect(status.enabled).toBe(false);
    expect(status.backupCodesRemaining).toBe(0);
  });

  it('passes through for accounts with no second factor', async () => {
    expect(await verifySecondFactor(world.patientSession.id, 'anything')).toBe(true);
  });
});

describe('rate limiting and login lockout', () => {
  const key = subjectKey('test-lockout', 'user@example.test', '198.51.100.7');

  beforeEach(async () => {
    await db.rateLimitHit.deleteMany({ where: { bucket: 'login' } });
  });

  it('locks out after the configured number of failures', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      expect((await checkLimit(RATE_LIMITS.login, key)).allowed).toBe(true);
      await recordAttempt(RATE_LIMITS.login, key, false);
    }

    const verdict = await checkLimit(RATE_LIMITS.login, key);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMITS.login.windowSeconds);
  });

  it('counts only failures for the login bucket', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max + 5; i++) {
      await recordAttempt(RATE_LIMITS.login, key, true);
    }
    // Successful logins must never contribute to a lockout, or a busy reception desk
    // locks itself out during a normal shift.
    expect((await checkLimit(RATE_LIMITS.login, key)).allowed).toBe(true);
  });

  it('clears failures after a success', async () => {
    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      await recordAttempt(RATE_LIMITS.login, key, false);
    }
    expect((await checkLimit(RATE_LIMITS.login, key)).allowed).toBe(false);

    await clearFailures(RATE_LIMITS.login, key);
    expect((await checkLimit(RATE_LIMITS.login, key)).allowed).toBe(true);
  });

  it('keeps subjects independent', async () => {
    const other = subjectKey('test-lockout', 'someone-else@example.test', '198.51.100.7');

    for (let i = 0; i < RATE_LIMITS.login.max; i++) {
      await recordAttempt(RATE_LIMITS.login, key, false);
    }

    expect((await checkLimit(RATE_LIMITS.login, key)).allowed).toBe(false);
    expect((await checkLimit(RATE_LIMITS.login, other)).allowed).toBe(true);
  });

  it('stores a hashed subject, never the raw email or IP', async () => {
    await recordAttempt(RATE_LIMITS.login, key, false);

    const rows = await db.rateLimitHit.findMany({ where: { bucket: 'login' }, select: { key: true } });
    const blob = JSON.stringify(rows);

    expect(blob).not.toContain('user@example.test');
    expect(blob).not.toContain('198.51.100.7');
    expect(rows[0]!.key).toMatch(/^[0-9a-f]{32}$/);
  });
});

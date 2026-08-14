import { describe, it, expect } from 'vitest';
import { changePasswordSchema } from '@/lib/validation/security';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';

describe('password change policy', () => {
  it('requires at least 12 characters for the new password', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a-long-enough-one' }).success
    ).toBe(true);
  });

  it('still demands the current password — a session alone is not enough', () => {
    // The account being changed is, by definition, one whose password is published in this
    // repository. Letting a session set a new one without proving the old one would make a
    // borrowed device a takeover.
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'a-long-enough-one' }).success
    ).toBe(false);
  });

  it('the assigned default is long enough to pass the length rule, so it needs its own check', () => {
    // Documents why changeOwnPassword rejects it explicitly rather than relying on the
    // schema: DocBook@2026 is 13 characters and would otherwise be an acceptable "new"
    // password.
    expect(DEFAULT_ASSIGNED_PASSWORD.length).toBeGreaterThanOrEqual(12);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: DEFAULT_ASSIGNED_PASSWORD }).success
    ).toBe(true);
  });
});

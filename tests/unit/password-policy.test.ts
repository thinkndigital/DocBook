import { describe, it, expect } from 'vitest';
import { changePasswordSchema } from '@/lib/validation/security';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';

describe('password change policy', () => {
  it('imposes no minimum length — a product decision, recorded so it is not "fixed" by accident', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a' }).success).toBe(true);
  });

  it('still rejects an empty new password', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: '' }).success).toBe(false);
  });

  it('caps length, which bounds what gets hashed rather than demanding strength', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a'.repeat(201) }).success
    ).toBe(false);
  });

  it('still demands the current password — a session alone is not enough', () => {
    // The account being changed is, by definition, one whose password is published in this
    // repository. Letting a session set a new one without proving the old one would make a
    // borrowed device a takeover.
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'anything' }).success
    ).toBe(false);
  });

  it('leaves the assigned default for changeOwnPassword to reject, not the schema', () => {
    // The schema admits it — there is no length or content rule that would catch it. The
    // explicit check in changeOwnPassword is therefore the *only* thing stopping "change
    // your password" from being satisfied by retyping the one in this repo, which is why
    // that check is not a strength rule and did not go with the length minimum.
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: DEFAULT_ASSIGNED_PASSWORD }).success
    ).toBe(true);
  });
});

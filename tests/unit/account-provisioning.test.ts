import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { resolveInitialPassword } from '@/lib/services/account-provisioning';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';

describe('resolveInitialPassword', () => {
  it('uses the custom password and does not force a change when the creator typed one', async () => {
    const { passwordHash, mustChangePassword } = await resolveInitialPassword('a-password-the-admin-chose');
    expect(mustChangePassword).toBe(false);
    expect(await bcrypt.compare('a-password-the-admin-chose', passwordHash)).toBe(true);
  });

  it('falls back to the published default and forces a change when left blank', async () => {
    const { passwordHash, mustChangePassword } = await resolveInitialPassword(undefined);
    expect(mustChangePassword).toBe(true);
    expect(await bcrypt.compare(DEFAULT_ASSIGNED_PASSWORD, passwordHash)).toBe(true);
  });

  it('treats an empty string the same as blank — not a chosen password', async () => {
    const { mustChangePassword } = await resolveInitialPassword('');
    expect(mustChangePassword).toBe(true);
  });
});

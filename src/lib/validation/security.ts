import { z } from 'zod';

/** A TOTP code or a backup code — both are short, user-typed secrets. */
export const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6).max(16),
});

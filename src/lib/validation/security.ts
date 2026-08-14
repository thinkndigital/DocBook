import { z } from 'zod';

/** A TOTP code or a backup code — both are short, user-typed secrets. */
export const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6).max(16),
});

/**
 * Changing one's own password.
 *
 * The minimum is 12 rather than the more common 8. These accounts reach patient records,
 * and the alternative to a strong password here is the one printed in this repository —
 * anything that merely clears a low bar is not an improvement on it. No composition rules
 * (upper/digit/symbol): they push people toward predictable substitutions and shorter
 * secrets, while length is what actually costs an attacker.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(200),
});

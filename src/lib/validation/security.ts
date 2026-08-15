import { z } from 'zod';

/** A TOTP code or a backup code — both are short, user-typed secrets. */
export const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6).max(16),
});

/**
 * Changing one's own password.
 *
 * No minimum length, by product decision. Recorded here rather than left to be rediscovered:
 * these accounts reach patient records, so the usual argument for a floor applies, and the
 * owner chose not to impose one. The UI does not state a requirement either — a rule that
 * is enforced but unstated is worse than no rule.
 *
 * The 200 cap is not a strength rule and stays regardless: it bounds what gets hashed.
 *
 * What is *not* a length rule and therefore survives this: `changeOwnPassword` refuses
 * DEFAULT_ASSIGNED_PASSWORD as a new value. Without that, "change your password" could be
 * satisfied by re-entering the one published in this repository, which would make the whole
 * mustChangePassword flow ceremonial.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // min(1) only rejects an empty string; it is not a strength requirement.
  newPassword: z.string().min(1).max(200),
});

/**
 * An admin setting/resetting someone else's password. Same "no minimum length" rule as
 * changePasswordSchema — see the comment there — and the same reason it stays unbounded
 * above 0: an empty string is treated as "reset to the default", not as a chosen password,
 * so it's a separate branch in the route rather than something this schema rejects.
 */
export const adminSetPasswordSchema = z.object({
  newPassword: z.string().min(1).max(200).optional(),
});

import { z } from 'zod';

/**
 * Every email that enters the system, on any path.
 *
 * Email local-parts are case-sensitive per RFC 5321 but no mail provider anyone books a
 * doctor with treats them that way, while `User.email` is a Postgres unique column — which
 * *is* case-sensitive. Accepting the address as typed therefore breaks two things at once:
 *
 *  - The uniqueness guarantee. `findUnique({ where: { email } })` in the registration path
 *    does not see `Ali@x.com` when checking `ali@x.com`, and neither does the database
 *    constraint, so one person ends up with two accounts and two medical identities.
 *  - Login. `authorize()` looks the user up by the string typed into the form, so someone
 *    who registered with a capital and later typed it lowercase is told their password is
 *    wrong — the one error message that reliably sends people to support.
 *
 * Normalising at the validation boundary means the rest of the codebase can compare emails
 * with `===` and be right. Services that write users normalise again rather than trusting
 * their caller, since a service is reachable from more than one route.
 */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

/** Same normalisation, for code paths that are not Zod-validated (auth callbacks, scripts). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

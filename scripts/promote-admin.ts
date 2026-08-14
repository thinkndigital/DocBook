/**
 * Promote an existing account to SUPER_ADMIN.
 *
 *   ADMIN_EMAIL=you@example.com tsx scripts/promote-admin.ts
 *
 * Why this exists: the only public sign-up path creates a PATIENT
 * (`/api/v1/auth/register`), and nothing in the application can mint a SUPER_ADMIN — by
 * design, since a route that could would be the single most valuable thing on the platform
 * to find. That leaves a real deployment with no way in except `prisma/seed.ts`, which
 * also creates demo tenants and doctors under a password published in this repo.
 *
 * So: register yourself normally through the site, then run this once against the database.
 *
 * It deliberately refuses to create a user. Requiring the account to already exist means
 * the password was chosen by a human through the normal flow and never passed through a
 * command line, a workflow input, or a log.
 *
 * SUPER_ADMIN is `'*'` in the RBAC matrix (`src/types/rbac.ts`) — every permission, every
 * tenant. Note that "every permission" still excludes clinical content: medical records and
 * prescriptions are gated on a treatment relationship in
 * `src/lib/services/clinical-access.ts`, which gives SUPER_ADMIN nothing.
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error('Set ADMIN_EMAIL to the address of an account that already exists.');
  }

  // Case-insensitive on purpose. This runs against databases written before emails were
  // normalised, where the stored address can still carry capitals; an exact lookup on the
  // lowercased input misses the very account it was pointed at and reports "no such user"
  // about a user that is plainly there.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!user) {
    // "No account found" alone cannot distinguish a mistyped address from a sign-up that
    // never wrote a row, and those need opposite fixes. The count separates them without
    // printing anyone's address — these logs are public on a public repository.
    const total = await prisma.user.count();
    throw new Error(
      `No account found for ${email}.\n` +
        `The database holds ${total} account(s).\n` +
        (total === 0
          ? 'None at all — registration did not complete. Sign up on the site, confirm you land on a logged-in page, then re-run this.'
          : 'So accounts exist but none match that address — check the spelling against what you typed when signing up.')
    );
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    console.log(`${email} is already SUPER_ADMIN — nothing to do.`);
    return;
  }

  // A SUPER_ADMIN belongs to the platform, not to a clinic. Leaving a stale tenantId here
  // would put every query this account makes back inside one tenant's scope (the middleware
  // in src/lib/tenant.ts reads it), so an admin promoted from a clinic account would see a
  // silently filtered view of the platform and conclude data was missing.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: UserRole.SUPER_ADMIN, tenantId: null, status: UserStatus.ACTIVE },
  });

  console.log(`Promoted ${updated.email} from ${user.role} to SUPER_ADMIN.`);
  if (user.tenantId) console.log(`Cleared tenant association ${user.tenantId}.`);
  console.log('Sign out and back in — the role is read into the session at login.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

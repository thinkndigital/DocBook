/**
 * Lowercase every stored `User.email`.
 *
 *   tsx scripts/normalize-emails.ts
 *
 * Registration used to store the address exactly as typed while `User.email` is a
 * case-sensitive unique column, so rows written before that fix can hold capitals. Login
 * now normalises the address before looking it up, which is correct going forward and
 * would lock those accounts out — the lookup would miss and report a wrong password.
 *
 * Idempotent: rows already lowercase are skipped, so this is safe to run on every deploy.
 *
 * It refuses to touch anything if two accounts differ only by case. Merging them means
 * deciding which person's appointments, records and prescriptions survive, and that is not
 * a decision a migration script gets to make silently — it prints both and exits non-zero.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  const byNormalized = new Map<string, { id: string; email: string }[]>();
  for (const user of users) {
    const key = user.email.trim().toLowerCase();
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), user]);
  }

  const collisions = [...byNormalized.entries()].filter(([, group]) => group.length > 1);
  if (collisions.length > 0) {
    console.error('Refusing to normalise — these addresses differ only by case:');
    for (const [key, group] of collisions) {
      console.error(`  ${key}`);
      for (const u of group) console.error(`    - ${u.email} (${u.id})`);
    }
    console.error('\nResolve by hand: decide which account keeps the address, then re-run.');
    process.exit(1);
  }

  const needsChange = users.filter((u) => u.email !== u.email.trim().toLowerCase());
  if (needsChange.length === 0) {
    console.log(`All ${users.length} account emails are already normalised.`);
    return;
  }

  for (const user of needsChange) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: user.email.trim().toLowerCase() },
    });
    console.log(`${user.email} -> ${user.email.trim().toLowerCase()}`);
  }
  console.log(`Normalised ${needsChange.length} of ${users.length} accounts.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

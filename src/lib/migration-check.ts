import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Startup check that the database schema matches the migrations in the repo.
 *
 * An unapplied migration is one of the easiest deployment mistakes to make — pull, build,
 * start, forget `prisma migrate deploy` — and it surfaces in the worst possible way: the
 * app boots fine, most pages work, and then one page or endpoint returns a bare
 * "Internal Server Error" with the real cause ("the table X does not exist") buried in the
 * server log. That is the same class of problem as the missing `FIELD_ENCRYPTION_KEY`
 * that `env-check.ts` was written for, so it gets the same treatment: say the actual thing
 * that is wrong, at startup, by name.
 *
 * This **warns rather than throws**, unlike `checkRequiredEnv`. A missing encryption key
 * means clinical data would be written in plaintext, which must stop the process. A
 * pending migration usually means one new feature is broken while booking, queue, and
 * records keep working — and taking a clinic's whole platform offline over a feature they
 * may not have opened yet is the worse outcome. Loud and legible, not fatal.
 */
export function checkMigrationsApplied(applied: Set<string>, migrationsDir: string): string[] {
  let onDisk: string[];
  try {
    onDisk = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // No migrations directory (e.g. a runtime image that didn't copy prisma/) — nothing to
    // compare against, so there is nothing to report.
    return [];
  }

  return onDisk.filter((name) => !applied.has(name));
}

export async function reportPendingMigrations(): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    const applied = new Set(rows.map((row) => row.migration_name));
    const pending = checkMigrationsApplied(applied, join(process.cwd(), 'prisma', 'migrations'));

    if (pending.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n[migrations] ${pending.length} migration(s) are NOT applied to this database:\n` +
          pending.map((name) => `  - ${name}`).join('\n') +
          '\n\nFeatures that depend on them will fail with a 500 until you run:\n' +
          '  npx prisma migrate deploy\n'
      );
    }
  } catch (err) {
    // A database that is unreachable at boot is not this check's problem to report — the
    // first request will surface it far more clearly than a startup guess would.
    // eslint-disable-next-line no-console
    console.warn(
      '[migrations] Could not verify migration state at startup: ' +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

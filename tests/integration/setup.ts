import { beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';

/**
 * Integration-test setup.
 *
 * These tests run against a **real Postgres**, not a mock or an in-memory substitute. That
 * is not thoroughness for its own sake: the two guarantees this suite exists to prove — the
 * double-booking constraint and row-level tenant isolation — are enforced by a partial
 * unique index, a `SERIALIZABLE` transaction, and a Prisma middleware. Every one of those
 * lives below the application code a mock would replace, so a mocked test would assert that
 * my test double behaves, which is worth nothing.
 *
 * Run with: `docker compose up -d db && npx prisma migrate deploy && npm run test`
 */

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Integration tests need DATABASE_URL. Start a database (docker compose up -d db), ' +
        'apply migrations (npx prisma migrate deploy), then re-run.'
    );
  }

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Cannot reach the database at DATABASE_URL. Integration tests are not skipped when the ` +
        `database is missing — a silently-skipped double-booking test is how that guarantee ` +
        `quietly stops being true. Original error: ${err instanceof Error ? err.message : err}`
    );
  }

  // Fail loudly rather than producing confusing "table does not exist" errors mid-suite.
  const pending = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NULL
  `;
  if (Number(pending[0]?.count ?? 0) > 0) {
    throw new Error('The database has unfinished migrations. Run: npx prisma migrate deploy');
  }
});

afterAll(async () => {
  await db.$disconnect();
});

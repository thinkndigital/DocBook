import { defineWorkspace } from 'vitest/config';
import { resolve } from 'node:path';

const alias = { '@': resolve(__dirname, './src') };

/**
 * Two projects, because the two kinds of test have genuinely different requirements and
 * running them under one set of rules makes the fast ones as slow as the slow ones:
 *
 * - **unit**: pure functions (field encryption, TOTP, CSV escaping, the RBAC matrix, AI
 *   red-flag matching). No database, parallel, milliseconds.
 * - **integration**: real Postgres. These are the ones that carry the brief's
 *   non-negotiable. A double-booking guarantee implemented by a partial unique index and a
 *   `SERIALIZABLE` transaction cannot be demonstrated against a mock — the mock would be
 *   standing in for the exact mechanism under test.
 *
 * Integration runs **single-forked**: the tests create real races inside individual cases,
 * so letting Vitest also run whole files concurrently against one database would make
 * failures depend on scheduling rather than on the code.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      globals: true,
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      globals: true,
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      setupFiles: ['./tests/integration/setup.ts'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      // One module registry for the whole integration run, which is how the application
      // actually loads.
      //
      // Vitest's default is a fresh module graph per test file. Combined with the
      // `global.__prisma` singleton in src/lib/db.ts, that produces a subtle and entirely
      // artificial failure: the Prisma client is built once by whichever file runs first,
      // and its tenant middleware closes over *that* file's AsyncLocalStorage instance.
      // Every later file gets a fresh copy of src/lib/tenant.ts with a different storage
      // object, so `runWithTenant` writes to one store while the middleware reads another
      // — and tenant scoping appears broken in tests that pass when run alone.
      //
      // Sharing the registry matches production (Next.js has a single module registry) and
      // makes the isolation tests measure the code rather than the test runner.
      isolate: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]);

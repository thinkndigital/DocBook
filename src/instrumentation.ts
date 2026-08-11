/**
 * Next.js runs this once per server process at startup (enabled via
 * experimental.instrumentationHook). Used to validate configuration before the app can
 * serve a single request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkRequiredEnv } = await import('@/lib/env-check');
    checkRequiredEnv();

    // Deliberately after the env check and deliberately not awaited into the boot path's
    // failure mode: a pending migration is loud but not fatal (see migration-check.ts),
    // and it must not delay serving the first request.
    const { reportPendingMigrations } = await import('@/lib/migration-check');
    void reportPendingMigrations();
  }
}

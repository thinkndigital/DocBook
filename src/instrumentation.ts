/**
 * Next.js runs this once per server process at startup (enabled via
 * experimental.instrumentationHook). Used to validate configuration before the app can
 * serve a single request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkRequiredEnv } = await import('@/lib/env-check');
    checkRequiredEnv();
  }
}

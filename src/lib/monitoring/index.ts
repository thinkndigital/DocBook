import type { ErrorContext, ErrorReporter } from '@/lib/monitoring/provider';
import { ConsoleErrorReporter } from '@/lib/monitoring/console-reporter';

let cached: ErrorReporter | undefined;

/**
 * Resolves the configured reporter.
 *
 * Unlike `getPaymentProvider`, an unknown value here does **not** throw. The reasoning is
 * asymmetric on purpose: a misconfigured payment gateway must stop the app before it can
 * pretend to take money, whereas a misconfigured error reporter must never be the reason a
 * clinic cannot see its appointment book. So this degrades to the console reporter and says
 * so — losing observability, not availability.
 */
export function getErrorReporter(): ErrorReporter {
  if (cached) return cached;

  const configured = process.env.ERROR_REPORTER ?? 'console';

  switch (configured) {
    case 'console':
      cached = new ConsoleErrorReporter();
      break;
    default:
      cached = new ConsoleErrorReporter();
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: `Unknown ERROR_REPORTER "${configured}"; falling back to console. Errors are still recorded, but not sent anywhere.`,
        })
      );
  }

  return cached;
}

/**
 * Report without letting reporting become the failure.
 *
 * Every call site is already on an error path. A reporter that throws — a bad DSN, a
 * network timeout to a vendor — would replace a handled 500 with an unhandled one, and in
 * the API wrapper it would do so *after* the work succeeded. Same reasoning as
 * `dispatchNotificationAsync`: the observability of an action must never break the action.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  try {
    getErrorReporter().captureException(error, context);
  } catch {
    // Deliberately silent: there is nowhere left to report a failure of the reporter.
  }
}

export function reportMessage(message: string, context: ErrorContext): void {
  try {
    getErrorReporter().captureMessage(message, context);
  } catch {
    /* see above */
  }
}

/** Test-only: clears the memoised instance so a test can swap ERROR_REPORTER. */
export function resetErrorReporterForTests(): void {
  cached = undefined;
}

export type { ErrorReporter, ErrorContext } from '@/lib/monitoring/provider';

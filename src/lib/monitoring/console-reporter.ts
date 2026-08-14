import { describeError, type ErrorContext, type ErrorReporter } from '@/lib/monitoring/provider';

/**
 * Structured JSON to stderr.
 *
 * This is a real production choice on the configured target, not a placeholder standing in
 * for a "proper" service. App Hosting runs on Cloud Run, whose logging agent parses a JSON
 * line on stderr into a structured Cloud Logging entry — `severity` drives the log level,
 * and a log-based alert on `severity=ERROR` gives paging without any data leaving the
 * project. For a healthcare platform that last property is the point: no diagnosis, no
 * patient identifier and no stack trace crosses into a third party's storage, so there is
 * no additional processor to add to a data-protection agreement.
 *
 * Its limits are equally real, and are why the interface exists: no grouping, no
 * deduplication, no release tracking, no notification on a *new* error type. When those
 * are wanted, `ERROR_REPORTER=sentry` is one adapter file — see DEPLOYMENT.md.
 */
export class ConsoleErrorReporter implements ErrorReporter {
  readonly id = 'console';

  captureException(error: unknown, context: ErrorContext): void {
    const described = describeError(error);
    // console.error, not a logger dependency: one JSON line is exactly what the Cloud Run
    // agent wants, and an extra logging library would be one more place for a field to be
    // added that carries clinical content.
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: `${described.name}: ${described.message}`,
        where: context.where,
        code: context.code,
        userId: context.userId,
        tenantId: context.tenantId,
        role: context.role,
        stack: described.stack,
        timestamp: new Date().toISOString(),
      })
    );
  }

  captureMessage(message: string, context: ErrorContext): void {
    console.warn(
      JSON.stringify({
        severity: 'WARNING',
        message,
        where: context.where,
        code: context.code,
        tenantId: context.tenantId,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

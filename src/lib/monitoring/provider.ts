/**
 * Vendor-agnostic error reporting (brief §15 — no integration hard-coded to one vendor).
 *
 * The interface is narrow on purpose. It takes an error and a small, typed context — never
 * a request object, never a Prisma result, never a free-form bag. An error reporter is the
 * one component whose whole job is to copy data to a third party we do not control and
 * cannot audit, so the type system is the place to stop clinical content from reaching it.
 *
 * What a report may carry: what failed, where, which route, which role, and an opaque user
 * id. What it may never carry: a diagnosis, a note, a prescription, a patient name, an
 * email, or a phone number. `ErrorContext` has no field for any of those, and
 * `redactMessage` scrubs the ones that leak into exception strings anyway.
 */

export interface ErrorContext {
  /** Route or job that failed, e.g. 'POST /api/v1/tenant/appointments'. */
  readonly where: string;
  /** Opaque user id — an identifier, not an identity. Never an email or name. */
  readonly userId?: string;
  readonly tenantId?: string;
  readonly role?: string;
  /** Stable machine code (e.g. 'COMMISSION_MISCONFIGURED'), never interpolated user text. */
  readonly code?: string;
}

export interface ErrorReporter {
  readonly id: string;
  captureException(error: unknown, context: ErrorContext): void;
  /** For conditions that are not thrown but are worth alerting on (degraded provider, etc). */
  captureMessage(message: string, context: ErrorContext): void;
}

/**
 * Best-effort scrub of values that end up inside exception *messages* — Prisma in
 * particular echoes column values into constraint-violation errors, which is how a patient
 * email or phone number reaches a stack trace without anyone passing it deliberately.
 *
 * This is a second line of defence, not the first. The first is that `ErrorContext` gives
 * callers nowhere to put such values.
 */
export function redactMessage(message: string): string {
  return (
    message
      // Email addresses.
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      // Jordanian/GCC style international numbers and long digit runs (phones, ids).
      .replace(/\+?\d[\d\s-]{7,}\d/g, '[number]')
      // Anything that looks like our encryption envelope, in case ciphertext is echoed.
      .replace(/v1:[A-Za-z0-9+/=]{16,}/g, '[encrypted]')
      // Connection strings, if a driver error quotes one.
      .replace(/(postgres(?:ql)?:\/\/)[^\s"']+/gi, '$1[redacted]')
  );
}

/** Normalises an unknown throw into a reportable shape, with the message redacted. */
export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactMessage(error.message),
      stack: error.stack ? redactMessage(error.stack) : undefined,
    };
  }
  return { name: 'UnknownError', message: redactMessage(String(error)) };
}

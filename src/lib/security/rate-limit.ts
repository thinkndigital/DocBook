import { createHash } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * General-purpose rate limiting and login lockout.
 *
 * Generalises the AI-only limiter added in Phase 10, for the same reason it was
 * database-backed there: this app runs behind a load balancer with N replicas, so an
 * in-process counter enforcing 10/hour actually enforces 10N/hour and resets on every
 * deploy. On a login endpoint that is the difference between a control and a decoration.
 *
 * ## Subjects are hashed
 *
 * A limiter only ever needs *equality* between subjects, never their values. Storing raw
 * IPs and email addresses against login timestamps would build a log of who tried to sign
 * in from where — a real privacy liability with no operational upside. Keys are salted
 * SHA-256.
 *
 * ## It fails open, deliberately
 *
 * If the database is unreachable, `consume` allows the request. That is the right way
 * round: an unthrottled login endpoint during a database outage is bad, but a *closed*
 * limiter would mean nobody — including the clinic trying to see today's appointments —
 * can sign in at all, and the outage already prevents the attacker from doing anything
 * useful with a stolen password.
 *
 * ## Known limitation
 *
 * Counting completed attempts means a simultaneous burst can slip a few over the line
 * before any are recorded. It bounds abuse; it is not a hard concurrency gate. A shared
 * token bucket (Redis) is the upgrade, and it is recorded in ROADMAP.md rather than
 * implied by this comment.
 */

export interface RateLimitRule {
  /** Bucket name, e.g. 'login'. */
  bucket: string;
  max: number;
  windowSeconds: number;
  /** When true, only failed attempts count — the shape a login lockout needs. */
  countFailuresOnly?: boolean;
}

/**
 * The limits. Tightest on the endpoints where an attacker gets the most value per attempt.
 */
export const RATE_LIMITS = {
  /** Per email+IP. 10 failures in 15 minutes locks that pair out. */
  login: { bucket: 'login', max: 10, windowSeconds: 15 * 60, countFailuresOnly: true },
  /** Account creation from one IP — the spam/enumeration vector. */
  register: { bucket: 'register', max: 5, windowSeconds: 60 * 60 },
  /** Password-equivalent: a 6-digit code has 1e6 possibilities, so attempts must be scarce. */
  twoFactor: { bucket: '2fa', max: 8, windowSeconds: 15 * 60, countFailuresOnly: true },
  /**
   * Public partner enquiries from one address. Low on purpose: a legitimate clinic submits
   * once, and the form is an unauthenticated write reachable by anyone, so the only thing
   * volume here can mean is spam filling the review queue.
   */
  partnerApplication: { bucket: 'partner-application', max: 3, windowSeconds: 24 * 60 * 60 },
  /** Blanket ceiling for unauthenticated API traffic from one address. */
  publicApi: { bucket: 'public-api', max: 300, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

function salt(): string {
  return process.env.RATE_LIMIT_SALT ?? process.env.NEXTAUTH_SECRET ?? 'docbook-dev-rate-limit-salt';
}

export function subjectKey(...parts: Array<string | null | undefined>): string {
  return createHash('sha256')
    .update(parts.filter(Boolean).join('|') + '|' + salt())
    .digest('hex')
    .slice(0, 32);
}

/** Best-effort client IP. Header-less callers deliberately share one bucket. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Checks the limit without recording anything. Use before doing the work. */
export async function checkLimit(rule: RateLimitRule, key: string): Promise<RateLimitVerdict> {
  const windowStart = new Date(Date.now() - rule.windowSeconds * 1000);

  try {
    const used = await db.rateLimitHit.count({
      where: {
        bucket: rule.bucket,
        key,
        createdAt: { gte: windowStart },
        ...(rule.countFailuresOnly ? { success: false } : {}),
      },
    });

    if (used < rule.max) {
      return { allowed: true, remaining: rule.max - used, retryAfterSeconds: 0 };
    }

    const oldest = await db.rateLimitHit.findFirst({
      where: {
        bucket: rule.bucket,
        key,
        createdAt: { gte: windowStart },
        ...(rule.countFailuresOnly ? { success: false } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const freesAt = (oldest?.createdAt.getTime() ?? Date.now()) + rule.windowSeconds * 1000;

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((freesAt - Date.now()) / 1000)),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rate-limit] check failed, allowing:', err instanceof Error ? err.message : err);
    return { allowed: true, remaining: 0, retryAfterSeconds: 0 };
  }
}

/** Records one attempt. Never throws — a bookkeeping failure must not fail the request. */
export async function recordAttempt(rule: RateLimitRule, key: string, success: boolean): Promise<void> {
  try {
    await db.rateLimitHit.create({ data: { bucket: rule.bucket, key, success } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rate-limit] record failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Clears a subject's failures. Called after a successful login so a user who mistyped
 * their password four times isn't still one slip from a lockout for the next 15 minutes.
 */
export async function clearFailures(rule: RateLimitRule, key: string): Promise<void> {
  try {
    await db.rateLimitHit.deleteMany({ where: { bucket: rule.bucket, key, success: false } });
  } catch {
    // Non-fatal: the window expires on its own.
  }
}

/**
 * Deletes hits older than the longest window. Nothing calls this on a schedule yet — the
 * scheduler arrives with Phase 14's deployment target — so it is exported for that wiring
 * and for operators to run manually rather than pretending a cron exists.
 */
export async function pruneRateLimitHits(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const { count } = await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

import { createHash } from 'node:crypto';
import type { AiInteractionKind, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Rate limiting and usage recording for AI calls, both backed by the `ai_interactions`
 * table.
 *
 * ## Why the database rather than an in-memory bucket
 *
 * An in-process counter is per *instance*. This app is built to run behind a load
 * balancer with N replicas, so an in-memory limit of 10/hour is really 10N/hour, and it
 * resets on every deploy. For a public, unauthenticated endpoint that spends money per
 * call on a third-party API, that is the difference between a limit and a suggestion.
 * Counting rows costs one indexed query (`@@index([actorKey, createdAt])`) and holds
 * across replicas and restarts.
 *
 * The honest limitation: this counts *completed* calls, so a burst of simultaneous
 * requests can slip a few over the line before any of them are recorded. It bounds cost
 * and abuse, it is not a hard concurrency gate — Phase 12 (security hardening) is where a
 * shared token-bucket in front of the whole API belongs.
 *
 * ## Why the actor key is hashed
 *
 * The rate-limit subject for anonymous triage is the client IP. Storing raw IPs against
 * symptom-search timestamps would build a log of who looked up which symptoms from which
 * address — a re-identification risk with no operational upside, since limiting only needs
 * *equality*, not the value itself. It is hashed with a server-side salt so the column is
 * not a rainbow-table lookup away from the original.
 */

const LIMITS: Record<AiInteractionKind, { max: number; windowMinutes: number }> = {
  // Public and unauthenticated: the tightest budget.
  SYMPTOM_TRIAGE: { max: 15, windowMinutes: 60 },
  // Authenticated patients, asking about their own bookings.
  PATIENT_ASSISTANT: { max: 30, windowMinutes: 60 },
  // Clinic staff; a briefing is a page load, and cached below anyway.
  CLINIC_BRIEFING: { max: 60, windowMinutes: 60 },
};

/**
 * Salt for actor-key hashing. Falls back to NEXTAUTH_SECRET (always present in
 * production — `checkRequiredEnv` enforces it) so this needs no new required variable.
 */
function salt(): string {
  return process.env.AI_ACTOR_SALT ?? process.env.NEXTAUTH_SECRET ?? 'docbook-dev-actor-salt';
}

export function actorKeyForUser(userId: string): string {
  return createHash('sha256').update(`user:${userId}:${salt()}`).digest('hex').slice(0, 32);
}

export function actorKeyForIp(ip: string): string {
  return createHash('sha256').update(`ip:${ip}:${salt()}`).digest('hex').slice(0, 32);
}

/**
 * Best-effort client IP. Trusts `x-forwarded-for` only as the *first* hop, and falls back
 * to a constant when there is no header at all — which deliberately makes every
 * header-less caller share one bucket rather than each getting their own unlimited one.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
  remaining: number;
}

export async function checkRateLimit(kind: AiInteractionKind, actorKey: string): Promise<RateLimitVerdict> {
  const limit = LIMITS[kind];
  const windowStart = new Date(Date.now() - limit.windowMinutes * 60_000);

  let used: number;
  try {
    used = await db.aiInteraction.count({
      where: { kind, actorKey, createdAt: { gte: windowStart } },
    });
  } catch (err) {
    // Fail OPEN, matching what `recordAiUsage` already does and for the same stated
    // reason: an unlimited symptom checker for the duration of an infrastructure problem
    // beats a symptom checker that is down during one. This previously threw, which turned
    // a single unavailable table — an unapplied migration on a fresh deploy is the common
    // case — into a 500 on the symptom checker and a blank error page on clinic insights.
    // eslint-disable-next-line no-console
    console.error(
      '[ai] Rate-limit check failed; allowing the request. If this repeats, the ai_interactions ' +
        'table is unreachable — check that migrations are applied (npx prisma migrate deploy). ' +
        (err instanceof Error ? err.message : String(err))
    );
    return { allowed: true, retryAfterSeconds: 0, remaining: 0 };
  }

  if (used < limit.max) {
    return { allowed: true, retryAfterSeconds: 0, remaining: limit.max - used };
  }

  // Retry-After is measured from the oldest call still inside the window — that is the
  // one whose expiry frees a slot.
  const oldest = await db.aiInteraction.findFirst({
    where: { kind, actorKey, createdAt: { gte: windowStart } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const freesAt = (oldest?.createdAt.getTime() ?? Date.now()) + limit.windowMinutes * 60_000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((freesAt - Date.now()) / 1000)),
    remaining: 0,
  };
}

export interface UsageRecord {
  kind: AiInteractionKind;
  actorKey: string;
  provider: string;
  disclaimerVersion: string;
  userId?: string | null;
  tenantId?: string | null;
  inputChars?: number;
  suggestedSlugs?: string[];
  redFlagged?: boolean;
  injectionFlagged?: boolean;
  latencyMs?: number;
  succeeded?: boolean;
}

/**
 * Writes the ledger row. Never throws: a failure to record usage must not fail the
 * user's request — the same reasoning as `dispatchNotificationAsync`. The cost is that a
 * database outage temporarily removes the rate limit, which is the right way round: an
 * unlimited symptom checker for the duration of an outage beats a symptom checker that is
 * down during one.
 */
export async function recordAiUsage(record: UsageRecord): Promise<void> {
  try {
    const data: Prisma.AiInteractionUncheckedCreateInput = {
      kind: record.kind,
      actorKey: record.actorKey,
      provider: record.provider,
      disclaimerVersion: record.disclaimerVersion,
      userId: record.userId ?? null,
      // Set explicitly: the tenant middleware treats AiInteraction as optional-tenant, and
      // an unchecked create bypasses its injection anyway (see src/lib/tenant.ts).
      tenantId: record.tenantId ?? null,
      inputChars: record.inputChars ?? 0,
      suggestedSlugs: record.suggestedSlugs ?? [],
      redFlagged: record.redFlagged ?? false,
      injectionFlagged: record.injectionFlagged ?? false,
      latencyMs: record.latencyMs ?? 0,
      succeeded: record.succeeded ?? true,
    };
    await db.aiInteraction.create({ data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai] Failed to record usage:', err instanceof Error ? err.message : err);
  }
}

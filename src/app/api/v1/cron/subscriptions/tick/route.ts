import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { runSubscriptionBillingCycle } from '@/lib/services/subscriptions';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const providedBuf = Buffer.from(provided, 'utf8');
  const secretBuf = Buffer.from(secret, 'utf8');
  if (providedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(providedBuf, secretBuf);
}

/**
 * Meant to be hit periodically (daily is enough given the multi-day reminder window and
 * grace period) by an external scheduler — this deployment target (App Hosting/Cloud Run)
 * has no built-in cron. Public by necessity, like the PayTabs callback, so auth is a bearer
 * secret rather than a session; unlike a webhook there's no third party signing anything, so
 * a shared secret compared in constant time is the right (and simplest correct) mechanism.
 *
 * Safe to call more often than needed, or to retry after a failure: every pass inside
 * runSubscriptionBillingCycle only matches rows still in the state it's transitioning out
 * of, so a row already moved by an earlier call is left alone on the next one.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return errorResponse('NOT_CONFIGURED', 'CRON_SECRET is not set.', 503);
  if (!isAuthorized(req, secret)) return errorResponse('UNAUTHORIZED', 'Invalid or missing bearer token.', 401);

  const result = await runSubscriptionBillingCycle();
  return okResponse(result);
}

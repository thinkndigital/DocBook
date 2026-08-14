import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reportMessage } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

/**
 * Liveness + readiness for uptime monitoring and platform health checks.
 *
 * Deliberately unauthenticated — a health check that needs a credential is one an uptime
 * monitor cannot use — and therefore deliberately uninformative. It answers "can this
 * instance serve a request that touches the database", and nothing else: no version, no
 * hostname, no migration state, no error text. Each of those is genuinely useful during an
 * incident and each is also free reconnaissance on an endpoint anyone can poll. The details
 * belong in logs, which are already authenticated.
 *
 * `SELECT 1` rather than counting a table: it proves the connection pool can reach Postgres
 * and get a reply, without a query whose cost grows with the data.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    // 503, not 500: this is "not ready to serve", which is what makes a load balancer stop
    // sending traffic here and an uptime monitor page someone.
    reportMessage('Health check failed: database unreachable', {
      where: 'GET /api/health',
      code: 'HEALTH_DB_UNREACHABLE',
    });
    void error;
    return NextResponse.json({ status: 'unhealthy' }, { status: 503 });
  }

  return NextResponse.json(
    { status: 'ok', checks: { database: 'ok' }, durationMs: Date.now() - startedAt },
    // Never cached: a cached "ok" from a healthy minute is worse than no health check.
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

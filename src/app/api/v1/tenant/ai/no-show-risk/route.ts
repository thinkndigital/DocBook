import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { scoreUpcomingAppointments } from '@/lib/services/no-show-risk';

export const dynamic = 'force-dynamic';

/**
 * No-show risk for upcoming appointments.
 *
 * No rate limiting and no `AiInteraction` row: this endpoint makes no provider call and
 * sends nothing off-platform (see the decision note in `no-show-risk.ts`). Recording it as
 * AI usage would make the usage ledger lie about what actually left the building.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'ai:clinic_insights', async () => {
    const daysParam = Number(new URL(req.url).searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 30) : 7;
    return okResponse(await scoreUpcomingAppointments({ days }));
  });
}

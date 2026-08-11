import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { actorKeyForUser } from '@/lib/ai/usage';
import { buildClinicBriefing } from '@/lib/services/clinic-briefing';
import { isValidLocale } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

/**
 * Clinic operational briefing. Runs inside the caller's tenant context, so every figure
 * behind the narrative is scoped by the Prisma middleware — a clinic can only ever be
 * briefed on its own numbers.
 *
 * Note this never rate-limit-errors: `buildClinicBriefing` degrades to metrics-without-prose
 * instead, because the numbers are computed locally and cost nothing.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'ai:clinic_insights', async (user) => {
    const requested = new URL(req.url).searchParams.get('locale') ?? 'ar';
    const locale = isValidLocale(requested) ? requested : 'ar';

    const briefing = await buildClinicBriefing({
      locale,
      actorKey: actorKeyForUser(user.id),
      userId: user.id,
      tenantId: user.tenantId,
    });
    return okResponse(briefing);
  });
}

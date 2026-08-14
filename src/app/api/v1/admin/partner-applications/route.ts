import type { NextRequest } from 'next/server';
import type { PartnerApplicationStatus } from '@prisma/client';
import { getSessionUser } from '@/lib/api/session';
import { okResponse } from '@/lib/api/respond';
import { withAuthorization } from '@/lib/rbac';
import { listPartnerApplications } from '@/lib/services/partner-applications';

export const dynamic = 'force-dynamic';

/** The review queue. `partner_application:manage` is held only by SUPER_ADMIN. */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'partner_application:manage', async () => {
    const status = req.nextUrl.searchParams.get('status') as PartnerApplicationStatus | null;
    const applications = await listPartnerApplications({ status: status ?? undefined });
    return okResponse(applications);
  });
}

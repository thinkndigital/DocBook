import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { listTenantReviews } from '@/lib/services/reviews';
import type { ReviewStatus } from '@prisma/client';

export async function GET(req: Request) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'review:moderate', async () => {
    const status = new URL(req.url).searchParams.get('status') as ReviewStatus | null;
    return okResponse(await listTenantReviews({ status: status ?? undefined }));
  });
}

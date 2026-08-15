import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { browseEquipmentProducts } from '@/lib/services/equipment';

export const dynamic = 'force-dynamic';

/** Doctor browsing the published catalog across every supplier — not public, since ordering requires being signed in as a doctor anyway. */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment:browse', async () => {
    const search = req.nextUrl.searchParams.get('search') ?? undefined;
    const category = req.nextUrl.searchParams.get('category') ?? undefined;
    return okResponse(await browseEquipmentProducts({ search, category }));
  });
}

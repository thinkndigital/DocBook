import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { paginatedResponse, parseCursorPagination } from '@/lib/api/respond';
import { listAuditLogs } from '@/lib/services/admin-ops';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'audit_log:read', async () => {
    const { searchParams } = req.nextUrl;
    const { cursor, limit } = parseCursorPagination(searchParams);
    const { items, nextCursor } = await listAuditLogs({
      action: searchParams.get('action') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
      tenantId: searchParams.get('tenantId') ?? undefined,
      actorUserId: searchParams.get('actorUserId') ?? undefined,
      cursor,
      limit,
    });
    return paginatedResponse(items, nextCursor);
  });
}

import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { markNotificationRead } from '@/lib/services/notifications';

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Not authorized.', 401);
  // markNotificationRead scopes by userId, so this 404s rather than touching another user's row.
  const ok = await markNotificationRead(params.id, session.id);
  if (!ok) return errorResponse('NOTIFICATION_NOT_FOUND', 'No notification with that id.', 404);
  return okResponse({ read: true });
}

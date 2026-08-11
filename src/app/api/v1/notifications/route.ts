import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { listUserNotifications, countUnreadNotifications, markAllNotificationsRead } from '@/lib/services/notifications';

/** Any authenticated user has an inbox — no specific permission required, it's their own data. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Not authorized.', 401);
  const [items, unread] = await Promise.all([
    listUserNotifications(session.id),
    countUnreadNotifications(session.id),
  ]);
  return okResponse({ items, unread });
}

/** Mark everything read. */
export async function PATCH() {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Not authorized.', 401);
  const count = await markAllNotificationsRead(session.id);
  return okResponse({ markedRead: count });
}

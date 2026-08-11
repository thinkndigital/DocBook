import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { ensureCalendarFeedToken, regenerateCalendarFeedToken } from '@/lib/services/calendar';

function feedUrl(token: string): string {
  const base = process.env.NEXTAUTH_URL ?? '';
  return `${base}/api/v1/calendar/${token}.ics`;
}

/** Returns (creating on first use) the doctor's private subscription URL. */
export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'schedule:manage_own', async (user) => {
    const token = await ensureCalendarFeedToken(user.id, user);
    if (!token) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse({ url: feedUrl(token) });
  });
}

/** Rotate = revoke: any calendar already subscribed to the old URL stops receiving updates. */
export async function POST() {
  const session = await getSessionUser();
  return withAuthorization(session, 'schedule:manage_own', async (user) => {
    const token = await regenerateCalendarFeedToken(user.id, user);
    if (!token) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse({ url: feedUrl(token) });
  });
}

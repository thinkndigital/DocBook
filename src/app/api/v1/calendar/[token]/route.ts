import { buildDoctorCalendarFeed } from '@/lib/services/calendar';

export const dynamic = 'force-dynamic';

/**
 * Unauthenticated by necessity: calendar clients (Google/Apple/Outlook) fetch this URL
 * with no session, so the 256-bit token in the path IS the credential. That is why the
 * feed carries no clinical content and why regenerating the token (see
 * /api/v1/doctor/calendar-feed) instantly revokes every subscription.
 *
 * The route accepts `<token>.ics` as well as a bare token, since some clients append the
 * extension when subscribing.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/i, '');

  const feed = await buildDoctorCalendarFeed(token);
  if (!feed) {
    // Deliberately terse: don't confirm whether a token ever existed.
    return new Response('Not found', { status: 404 });
  }

  return new Response(feed, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="docbook.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}

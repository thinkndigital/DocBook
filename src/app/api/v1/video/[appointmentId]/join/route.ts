import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import {
  joinVideoSession,
  VideoSessionNotFoundError,
  NotVideoAppointmentError,
  NotParticipantError,
  VideoSessionEndedError,
} from '@/lib/services/video';

export const dynamic = 'force-dynamic';

/** Doctor or patient joining their own video consultation. See src/lib/services/video.ts for the ownership check. */
export async function POST(_req: Request, { params }: { params: { appointmentId: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'video_session:join_own', async (user) => {
    try {
      const result = await joinVideoSession(params.appointmentId, user);
      return okResponse({
        ...result,
        iceServers: [{ urls: (process.env.STUN_SERVER_URLS ?? 'stun:stun.l.google.com:19302').split(',') }],
      });
    } catch (err) {
      if (err instanceof VideoSessionNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
      if (err instanceof NotVideoAppointmentError) return errorResponse('NOT_VIDEO_APPOINTMENT', err.message, 400);
      if (err instanceof NotParticipantError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof VideoSessionEndedError) return errorResponse('SESSION_ENDED', err.message, 409);
      throw err;
    }
  });
}

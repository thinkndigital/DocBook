import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { endVideoSession, VideoSessionNotFoundError, NotVideoAppointmentError, NotParticipantError } from '@/lib/services/video';

export const dynamic = 'force-dynamic';

/** Either participant can end the call — there's no "host". */
export async function POST(_req: Request, { params }: { params: { appointmentId: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'video_session:join_own', async (user) => {
    try {
      const result = await endVideoSession(params.appointmentId, user);
      return okResponse(result);
    } catch (err) {
      if (err instanceof VideoSessionNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
      if (err instanceof NotVideoAppointmentError) return errorResponse('NOT_VIDEO_APPOINTMENT', err.message, 400);
      if (err instanceof NotParticipantError) return errorResponse('FORBIDDEN', err.message, 403);
      throw err;
    }
  });
}

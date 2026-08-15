import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { postVideoSignalSchema } from '@/lib/validation/video';
import {
  postVideoSignal,
  listVideoSignalsSince,
  VideoSessionNotFoundError,
  NotVideoAppointmentError,
  NotParticipantError,
  VideoSessionEndedError,
} from '@/lib/services/video';
import { checkLimit, RATE_LIMITS, subjectKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** Short-poll: the other participant's SDP/ICE messages since `after` (a `seq` cursor, default 0). */
export async function GET(req: NextRequest, { params }: { params: { appointmentId: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'video_session:join_own', async (user) => {
    const after = Number(req.nextUrl.searchParams.get('after') ?? '0');
    try {
      const signals = await listVideoSignalsSince(params.appointmentId, user, Number.isFinite(after) ? after : 0);
      return okResponse(signals.map((s) => ({ seq: s.seq, kind: s.kind, payload: s.payload })));
    } catch (err) {
      if (err instanceof VideoSessionNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
      if (err instanceof NotVideoAppointmentError) return errorResponse('NOT_VIDEO_APPOINTMENT', err.message, 400);
      if (err instanceof NotParticipantError) return errorResponse('FORBIDDEN', err.message, 403);
      throw err;
    }
  });
}

/**
 * Rate-limited per user, not just authorized: this is an unauthenticated-shape write loop
 * (a client polling + posting every ~1-2s for the call's duration) and the ceiling exists to
 * catch a runaway client loop, not a malicious one.
 */
export async function POST(req: NextRequest, { params }: { params: { appointmentId: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'video_session:join_own', async (user) => {
    const verdict = await checkLimit(RATE_LIMITS.publicApi, subjectKey('video-signal', user.id));
    if (!verdict.allowed) return errorResponse('RATE_LIMITED', 'Too many signals. Please try again shortly.', 429);

    try {
      const body = await parseBody(req, postVideoSignalSchema);
      const signal = await postVideoSignal(params.appointmentId, user, body.kind, body.payload);
      return okResponse({ seq: signal.seq }, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof VideoSessionNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
      if (err instanceof NotVideoAppointmentError) return errorResponse('NOT_VIDEO_APPOINTMENT', err.message, 400);
      if (err instanceof NotParticipantError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof VideoSessionEndedError) return errorResponse('SESSION_ENDED', err.message, 409);
      throw err;
    }
  });
}

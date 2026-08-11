import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { cancelAppointmentSchema } from '@/lib/validation/appointment';
import { cancelOwnAppointment, NotOwnAppointmentError, InvalidStatusTransitionError } from '@/lib/services/appointments';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:cancel_own', async (user) => {
    try {
      const body = await parseBody(req, cancelAppointmentSchema);
      const appointment = await cancelOwnAppointment(params.id, body.cancelReason, user);
      if (!appointment) return errorResponse('APPOINTMENT_NOT_FOUND', 'No appointment with that id.', 404);
      return okResponse(appointment);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof NotOwnAppointmentError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof InvalidStatusTransitionError) return errorResponse('INVALID_STATUS_TRANSITION', err.message, 409);
      throw err;
    }
  });
}

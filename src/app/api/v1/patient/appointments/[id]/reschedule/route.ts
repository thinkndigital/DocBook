import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { rescheduleAppointmentSchema } from '@/lib/validation/appointment';
import {
  rescheduleAppointment,
  NotOwnAppointmentError,
  NotReschedulableError,
  SlotUnavailableError,
  SlotTakenError,
} from '@/lib/services/appointments';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:reschedule_own', async (user) => {
    try {
      const body = await parseBody(req, rescheduleAppointmentSchema);
      const appointment = await rescheduleAppointment(params.id, body.scheduledAt, user);
      if (!appointment) return errorResponse('APPOINTMENT_NOT_FOUND', 'No appointment with that id.', 404);
      return okResponse(appointment, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof NotOwnAppointmentError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof NotReschedulableError) return errorResponse('NOT_RESCHEDULABLE', err.message, 409);
      if (err instanceof SlotUnavailableError) return errorResponse('SLOT_UNAVAILABLE', err.message, 409);
      if (err instanceof SlotTakenError) return errorResponse('SLOT_TAKEN', err.message, 409);
      throw err;
    }
  });
}

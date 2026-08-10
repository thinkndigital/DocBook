import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { rescheduleAppointmentSchema } from '@/lib/validation/appointment';
import { rescheduleAppointment, SlotUnavailableError, SlotTakenError, NotReschedulableError } from '@/lib/services/appointments';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(
    session,
    ['appointment:reschedule_own', 'appointment:manage_tenant'],
    async (user) => {
      try {
        const body = await parseBody(req, rescheduleAppointmentSchema);
        const appointment = await rescheduleAppointment(params.id, body.scheduledAt, user);
        if (!appointment) return errorResponse('APPOINTMENT_NOT_FOUND', 'No appointment with that id.', 404);
        return okResponse(appointment, 201);
      } catch (err) {
        if (err instanceof ValidationError) return validationErrorResponse(err);
        if (err instanceof NotReschedulableError) return errorResponse('NOT_RESCHEDULABLE', err.message, 409);
        if (err instanceof SlotUnavailableError) return errorResponse('SLOT_UNAVAILABLE', err.message, 409);
        if (err instanceof SlotTakenError) return errorResponse('SLOT_TAKEN', err.message, 409);
        throw err;
      }
    }
  );
}

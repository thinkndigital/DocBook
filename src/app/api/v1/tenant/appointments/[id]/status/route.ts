import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { appointmentStatusSchema } from '@/lib/validation/appointment';
import { setAppointmentStatus, InvalidStatusTransitionError } from '@/lib/services/appointments';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(
    session,
    ['queue:manage', 'appointment:manage_tenant', 'appointment:update_status'],
    async (user) => {
      try {
        const body = await parseBody(req, appointmentStatusSchema);
        const appointment = await setAppointmentStatus(params.id, body, user);
        if (!appointment) return errorResponse('APPOINTMENT_NOT_FOUND', 'No appointment with that id.', 404);
        return okResponse(appointment);
      } catch (err) {
        if (err instanceof ValidationError) return validationErrorResponse(err);
        if (err instanceof InvalidStatusTransitionError) return errorResponse('INVALID_STATUS_TRANSITION', err.message, 409);
        throw err;
      }
    }
  );
}

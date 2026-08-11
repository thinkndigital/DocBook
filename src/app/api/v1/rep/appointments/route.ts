import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createAppointmentSchema } from '@/lib/validation/appointment';
import {
  createAppointment,
  SlotUnavailableError,
  SlotTakenError,
  InvalidReferenceError,
} from '@/lib/services/appointments';
import { getOwnRepresentative, listRepBookedAppointments, TenantNotAssignedError } from '@/lib/services/representatives';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:create_on_behalf', async (user) => {
    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);
    const date = req.nextUrl.searchParams.get('date') ?? undefined;
    return okResponse(await listRepBookedAppointments(rep.id, { date }));
  });
}

/** Book on behalf of a patient — same schema as the receptionist flow (patientId or newPatient). */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:create_on_behalf', async (user) => {
    try {
      const body = await parseBody(req, createAppointmentSchema);
      const appointment = await createAppointment(body, user);
      return okResponse(appointment, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof TenantNotAssignedError) return errorResponse('TENANT_NOT_ASSIGNED', err.message, 403);
      if (err instanceof InvalidReferenceError) return errorResponse('INVALID_REFERENCE', err.message, 400);
      if (err instanceof SlotUnavailableError) return errorResponse('SLOT_UNAVAILABLE', err.message, 409);
      if (err instanceof SlotTakenError) return errorResponse('SLOT_TAKEN', err.message, 409);
      throw err;
    }
  });
}

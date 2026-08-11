import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { patientBookAppointmentSchema } from '@/lib/validation/appointment';
import {
  createAppointment,
  listOwnPatientAppointments,
  SlotUnavailableError,
  SlotTakenError,
  InvalidReferenceError,
} from '@/lib/services/appointments';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:read_own', async (user) => {
    const appointments = await listOwnPatientAppointments(user.id);
    if (appointments === null) return errorResponse('PATIENT_PROFILE_NOT_FOUND', 'No patient profile for this account.', 404);
    return okResponse(appointments);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:create', async (user) => {
    try {
      const body = await parseBody(req, patientBookAppointmentSchema);
      const appointment = await createAppointment(body, user);
      return okResponse(appointment, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof InvalidReferenceError) return errorResponse('INVALID_REFERENCE', err.message, 400);
      if (err instanceof SlotUnavailableError) return errorResponse('SLOT_UNAVAILABLE', err.message, 409);
      if (err instanceof SlotTakenError) return errorResponse('SLOT_TAKEN', err.message, 409);
      throw err;
    }
  });
}

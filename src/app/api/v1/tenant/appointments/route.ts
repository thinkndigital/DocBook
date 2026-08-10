import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createAppointmentSchema } from '@/lib/validation/appointment';
import {
  createAppointment,
  listAppointments,
  SlotUnavailableError,
  SlotTakenError,
  InvalidReferenceError,
} from '@/lib/services/appointments';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['queue:manage', 'appointment:manage_tenant'], async () => {
    const { searchParams } = req.nextUrl;
    const appointments = await listAppointments({
      date: searchParams.get('date') ?? undefined,
      branchId: searchParams.get('branchId') ?? undefined,
      doctorId: searchParams.get('doctorId') ?? undefined,
    });
    return okResponse(appointments);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['appointment:create_for_patient', 'appointment:manage_tenant'], async (user) => {
    try {
      const body = await parseBody(req, createAppointmentSchema);
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

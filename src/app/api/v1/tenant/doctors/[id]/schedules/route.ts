import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { setWeeklyScheduleSchema } from '@/lib/validation/schedule';
import { getWeeklySchedule, setWeeklySchedule, DoctorNotInTenantError, InvalidBranchError } from '@/lib/services/schedules';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'schedule:manage', async (user) => {
    try {
      return okResponse(await getWeeklySchedule(params.id, user.tenantId));
    } catch (err) {
      if (err instanceof DoctorNotInTenantError) return errorResponse('DOCTOR_NOT_FOUND', err.message, 404);
      throw err;
    }
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'schedule:manage', async (user) => {
    try {
      const body = await parseBody(req, setWeeklyScheduleSchema);
      const schedules = await setWeeklySchedule(params.id, user.tenantId, body, user);
      return okResponse(schedules);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof DoctorNotInTenantError) return errorResponse('DOCTOR_NOT_FOUND', err.message, 404);
      if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
      throw err;
    }
  });
}

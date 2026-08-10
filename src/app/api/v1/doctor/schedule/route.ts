import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { setWeeklyScheduleSchema } from '@/lib/validation/schedule';
import { getWeeklySchedule, setWeeklySchedule, InvalidBranchError } from '@/lib/services/schedules';
import { db } from '@/lib/db';

async function resolveOwnDoctor(userId: string) {
  return db.doctor.findUnique({ where: { userId } });
}

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'schedule:manage_own', async (user) => {
    const doctor = await resolveOwnDoctor(user.id);
    if (!doctor) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse(await getWeeklySchedule(doctor.id, doctor.tenantId));
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'schedule:manage_own', async (user) => {
    const doctor = await resolveOwnDoctor(user.id);
    if (!doctor) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    try {
      const body = await parseBody(req, setWeeklyScheduleSchema);
      const schedules = await setWeeklySchedule(doctor.id, doctor.tenantId, body, user);
      return okResponse(schedules);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
      throw err;
    }
  });
}

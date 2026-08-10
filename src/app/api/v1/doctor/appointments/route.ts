import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { listOwnDoctorAppointments } from '@/lib/services/appointments';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:read_own', async (user) => {
    const date = req.nextUrl.searchParams.get('date') ?? undefined;
    const appointments = await listOwnDoctorAppointments(user.id, { date });
    if (appointments === null) return errorResponse('DOCTOR_PROFILE_NOT_FOUND', 'No doctor profile for this account.', 404);
    return okResponse(appointments);
  });
}

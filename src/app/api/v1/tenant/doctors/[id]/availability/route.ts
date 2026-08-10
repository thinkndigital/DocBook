import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getAvailableSlots, DoctorNotInTenantError } from '@/lib/services/availability';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['appointment:create_for_patient', 'appointment:manage_tenant'], async (user) => {
    const branchId = req.nextUrl.searchParams.get('branchId');
    const date = req.nextUrl.searchParams.get('date');
    if (!branchId || !date) {
      return errorResponse('MISSING_PARAMS', 'branchId and date query params are required.', 400);
    }
    try {
      const slots = await getAvailableSlots(params.id, branchId, user.tenantId, date);
      return okResponse({ date, branchId, slots });
    } catch (err) {
      if (err instanceof DoctorNotInTenantError) return errorResponse('DOCTOR_NOT_FOUND', err.message, 404);
      throw err;
    }
  });
}

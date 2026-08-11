import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { getAvailableSlots } from '@/lib/services/availability';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['appointment:create_for_patient', 'appointment:manage_tenant'], async (user) => {
    const branchId = req.nextUrl.searchParams.get('branchId');
    const date = req.nextUrl.searchParams.get('date');
    if (!branchId || !date) {
      return errorResponse('MISSING_PARAMS', 'branchId and date query params are required.', 400);
    }
    // getAvailableSlots no longer takes a tenantId (see Phase 5 refactor for cross-tenant
    // patient booking) — the tenant-ownership check happens here instead.
    const doctor = await db.doctor.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
    if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'Doctor does not exist or does not belong to this tenant.', 404);

    const slots = await getAvailableSlots(params.id, branchId, date);
    return okResponse({ date, branchId, slots });
  });
}

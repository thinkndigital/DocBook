import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { db } from '@/lib/db';
import { getAvailableSlots } from '@/lib/services/availability';
import { getOwnRepresentative, assertRepAssignedToTenant, TenantNotAssignedError } from '@/lib/services/representatives';

/**
 * Separate from the public availability endpoint on purpose: the public one only serves
 * verified doctors, but a rep may book any doctor of an assigned tenant (the clinic
 * brought the rep in; platform verification gates marketplace visibility, not the
 * clinic's own booking channels).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'appointment:create_on_behalf', async (user) => {
    const branchId = req.nextUrl.searchParams.get('branchId');
    const date = req.nextUrl.searchParams.get('date');
    if (!branchId || !date) return errorResponse('MISSING_PARAMS', 'branchId and date query params are required.', 400);

    const rep = await getOwnRepresentative(user.id);
    if (!rep) return errorResponse('REP_PROFILE_NOT_FOUND', 'No representative profile for this account.', 404);

    const doctor = await db.doctor.findUnique({ where: { id: params.id } });
    if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);

    try {
      await assertRepAssignedToTenant(rep.id, doctor.tenantId);
    } catch (err) {
      if (err instanceof TenantNotAssignedError) return errorResponse('TENANT_NOT_ASSIGNED', err.message, 403);
      throw err;
    }

    const slots = await getAvailableSlots(params.id, branchId, date);
    return okResponse({ date, branchId, slots });
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateEquipmentOrderStatusSchema } from '@/lib/validation/equipment';
import { updateEquipmentOrderStatus, NotOwnOrderError, InvalidOrderStatusTransitionError } from '@/lib/services/equipment';
import { requireOwnSupplier, NoSupplierProfileError } from '@/lib/services/suppliers';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_order:manage_own', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      const body = await parseBody(req, updateEquipmentOrderStatusSchema);
      const order = await updateEquipmentOrderStatus(params.id, body.status, user, supplier.id);
      return okResponse(order);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      if (err instanceof NotOwnOrderError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof InvalidOrderStatusTransitionError) return errorResponse('INVALID_STATUS_TRANSITION', err.message, 409);
      throw err;
    }
  });
}

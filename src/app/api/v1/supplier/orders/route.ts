import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { listIncomingEquipmentOrders } from '@/lib/services/equipment';
import { requireOwnSupplier, NoSupplierProfileError } from '@/lib/services/suppliers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_order:manage_own', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      return okResponse(await listIncomingEquipmentOrders(supplier.id));
    } catch (err) {
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      throw err;
    }
  });
}

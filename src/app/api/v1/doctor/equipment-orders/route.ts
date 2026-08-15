import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createEquipmentOrderSchema } from '@/lib/validation/equipment';
import {
  createEquipmentOrder,
  listOwnEquipmentOrders,
  InvalidProductError,
  MixedSupplierOrderError,
  InsufficientStockError,
} from '@/lib/services/equipment';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_order:read_own', async (user) => {
    return okResponse(await listOwnEquipmentOrders(user.id));
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_order:create_own', async (user) => {
    try {
      const body = await parseBody(req, createEquipmentOrderSchema);
      const order = await createEquipmentOrder(body, user);
      return okResponse(order, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof InvalidProductError) return errorResponse('INVALID_PRODUCT', err.message, 400);
      if (err instanceof MixedSupplierOrderError) return errorResponse('MIXED_SUPPLIER_ORDER', err.message, 400);
      if (err instanceof InsufficientStockError) return errorResponse('INSUFFICIENT_STOCK', err.message, 409);
      throw err;
    }
  });
}

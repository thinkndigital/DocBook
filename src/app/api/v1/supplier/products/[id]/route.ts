import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateProductSchema } from '@/lib/validation/equipment';
import { updateProduct, deleteProduct, NotOwnProductError } from '@/lib/services/equipment';
import { requireOwnSupplier, NoSupplierProfileError } from '@/lib/services/suppliers';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_product:manage', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      const body = await parseBody(req, updateProductSchema);
      const product = await updateProduct(params.id, body, supplier.id);
      return okResponse(product);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      if (err instanceof NotOwnProductError) return errorResponse('FORBIDDEN', err.message, 403);
      throw err;
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_product:manage', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      await deleteProduct(params.id, supplier.id);
      return okResponse({ deleted: true });
    } catch (err) {
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      if (err instanceof NotOwnProductError) return errorResponse('FORBIDDEN', err.message, 403);
      throw err;
    }
  });
}

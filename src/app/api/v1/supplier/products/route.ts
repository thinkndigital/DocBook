import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createProductSchema } from '@/lib/validation/equipment';
import { listOwnProducts, createProduct } from '@/lib/services/equipment';
import { requireOwnSupplier, NoSupplierProfileError } from '@/lib/services/suppliers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_product:manage', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      return okResponse(await listOwnProducts(supplier.id));
    } catch (err) {
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      throw err;
    }
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'equipment_product:manage', async (user) => {
    try {
      const supplier = await requireOwnSupplier(user.id);
      const body = await parseBody(req, createProductSchema);
      const product = await createProduct(body, user, supplier.id);
      return okResponse(product, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof NoSupplierProfileError) return errorResponse('NO_SUPPLIER_PROFILE', err.message, 403);
      throw err;
    }
  });
}

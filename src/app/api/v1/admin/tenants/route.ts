import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, paginatedResponse, okResponse, parseCursorPagination } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createTenantSchema } from '@/lib/validation/admin';
import { createTenant, listTenants, TenantConflictError } from '@/lib/services/tenants';
import type { TenantStatus, TenantType } from '@prisma/client';

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:manage_all', async () => {
    const { searchParams } = req.nextUrl;
    const { cursor, limit } = parseCursorPagination(searchParams);
    const status = (searchParams.get('status') as TenantStatus | null) ?? undefined;
    const type = (searchParams.get('type') as TenantType | null) ?? undefined;

    const { items, nextCursor } = await listTenants({ cursor, limit, status, type });
    return paginatedResponse(items, nextCursor);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'tenant:manage_all', async (user) => {
    try {
      const body = await parseBody(req, createTenantSchema);
      const { tenant, adminUser } = await createTenant(body, user);
      return okResponse(
        {
          tenant,
          admin: { id: adminUser.id, email: adminUser.email, defaultPasswordAssigned: true },
        },
        201
      );
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof TenantConflictError) return errorResponse('TENANT_ADMIN_EMAIL_TAKEN', err.message, 409);
      throw err;
    }
  });
}

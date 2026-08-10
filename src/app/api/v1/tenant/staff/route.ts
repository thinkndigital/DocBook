import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createStaffSchema } from '@/lib/validation/tenant';
import { listStaff, createStaff, StaffConflictError, InvalidBranchError } from '@/lib/services/staff';

export async function GET() {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'staff:manage', async () => okResponse(await listStaff()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'staff:manage', async (user) => {
    try {
      const body = await parseBody(req, createStaffSchema);
      const staff = await createStaff(body, user);
      return okResponse(staff, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof StaffConflictError) return errorResponse('STAFF_EMAIL_TAKEN', err.message, 409);
      if (err instanceof InvalidBranchError) return errorResponse('INVALID_BRANCH', err.message, 400);
      throw err;
    }
  });
}

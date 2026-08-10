import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createBranchSchema } from '@/lib/validation/tenant';
import { listBranches, createBranch } from '@/lib/services/branches';

export async function GET() {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'branch:manage', async () => okResponse(await listBranches()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'branch:manage', async (user) => {
    try {
      const body = await parseBody(req, createBranchSchema);
      const branch = await createBranch(body, user);
      return okResponse(branch, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

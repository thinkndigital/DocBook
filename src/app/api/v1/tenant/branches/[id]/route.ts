import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateBranchSchema } from '@/lib/validation/tenant';
import { getBranch, updateBranch } from '@/lib/services/branches';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'branch:manage', async () => {
    const branch = await getBranch(params.id);
    if (!branch) return errorResponse('BRANCH_NOT_FOUND', 'No branch with that id.', 404);
    return okResponse(branch);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'branch:manage', async (user) => {
    try {
      const body = await parseBody(req, updateBranchSchema);
      const branch = await updateBranch(params.id, body, user);
      if (!branch) return errorResponse('BRANCH_NOT_FOUND', 'No branch with that id.', 404);
      return okResponse(branch);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

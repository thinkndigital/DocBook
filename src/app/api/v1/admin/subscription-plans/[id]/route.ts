import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updatePlanSchema } from '@/lib/validation/admin';
import { updatePlan } from '@/lib/services/plans';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'subscription_plan:manage', async (user) => {
    try {
      const body = await parseBody(req, updatePlanSchema);
      const plan = await updatePlan(params.id, body, user);
      if (!plan) return errorResponse('PLAN_NOT_FOUND', 'No subscription plan with that id.', 404);
      return okResponse(plan);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

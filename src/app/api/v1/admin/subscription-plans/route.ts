import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createPlanSchema } from '@/lib/validation/admin';
import { listPlans, createPlan } from '@/lib/services/plans';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'subscription_plan:manage', async () => okResponse(await listPlans()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'subscription_plan:manage', async (user) => {
    try {
      const body = await parseBody(req, createPlanSchema);
      const plan = await createPlan(body, user);
      return okResponse(plan, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

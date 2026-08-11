import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { subscribeSchema } from '@/lib/validation/billing';
import { getCurrentSubscription, subscribeTenantToPlan, PlanNotFoundError } from '@/lib/services/subscriptions';

export async function GET() {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'billing:manage_tenant', async (user) =>
    okResponse(await getCurrentSubscription(user.tenantId))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'billing:manage_tenant', async (user) => {
    try {
      const body = await parseBody(req, subscribeSchema);
      const subscription = await subscribeTenantToPlan(user.tenantId, body.planId, user);
      return okResponse(subscription, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof PlanNotFoundError) return errorResponse('PLAN_NOT_FOUND', err.message, 404);
      throw err;
    }
  });
}

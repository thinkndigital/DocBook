import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { commissionRuleSchema } from '@/lib/validation/billing';
import { listCommissionRules, upsertCommissionRule } from '@/lib/services/commissions';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'commission_rule:manage', async () => okResponse(await listCommissionRules()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'commission_rule:manage', async (user) => {
    try {
      const body = await parseBody(req, commissionRuleSchema);
      const rule = await upsertCommissionRule(body, user);
      return okResponse(rule, body.id ? 200 : 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

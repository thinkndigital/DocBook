import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { withAuthorization } from '@/lib/rbac';
import { reviewPartnerApplicationSchema } from '@/lib/validation/partner';
import { setPartnerApplicationStatus } from '@/lib/services/partner-applications';

export const dynamic = 'force-dynamic';

/**
 * Record a review decision.
 *
 * Approving does **not** create a tenant. It records that a human decided; the tenant is
 * then created through /admin/tenants. See the service module for why that separation is
 * deliberate rather than unfinished.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'partner_application:manage', async (user) => {
    try {
      const body = await parseBody(req, reviewPartnerApplicationSchema);
      const updated = await setPartnerApplicationStatus(params.id, body.status, user, body.reviewNotes);
      return okResponse(updated);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

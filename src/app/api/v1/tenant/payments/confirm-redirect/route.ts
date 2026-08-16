import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { confirmRedirectPaymentSchema } from '@/lib/validation/billing';
import {
  finalizeRedirectPayment,
  PaymentNotFoundError,
  InvalidPaymentStateError,
  PaymentGatewayError,
} from '@/lib/services/payments';

/**
 * Defense-in-depth confirmation from the browser's return trip off the hosted payment
 * page — never trusts the redirect's own query string beyond reading our own paymentId
 * out of it (a payer controls that URL); the actual outcome always comes from
 * finalizeRedirectPayment re-querying PayTabs directly using our stored providerRef.
 * Running inside withTenantAuthorizationAny's tenant context means a tenant admin can only
 * ever finalize a payment that resolves to their own tenant — the same isolation every
 * other tenant-scoped route gets for free.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['payment:collect', 'billing:manage_tenant'], async (user) => {
    try {
      const body = await parseBody(req, confirmRedirectPaymentSchema);
      const payment = await finalizeRedirectPayment(body.paymentId, user);
      return okResponse(payment);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof PaymentNotFoundError) return errorResponse('PAYMENT_NOT_FOUND', err.message, 404);
      if (err instanceof InvalidPaymentStateError) return errorResponse('INVALID_PAYMENT_STATE', err.message, 409);
      if (err instanceof PaymentGatewayError) return errorResponse('PAYMENT_FAILED', err.message, 402);
      throw err;
    }
  });
}

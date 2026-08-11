import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { refundPaymentSchema } from '@/lib/validation/billing';
import {
  refundPayment,
  PaymentNotFoundError,
  PaymentGatewayError,
  InvalidPaymentStateError,
} from '@/lib/services/payments';

/** Refunds are billing:manage_tenant only — a receptionist can take money, not give it back. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'billing:manage_tenant', async (user) => {
    try {
      const body = await parseBody(req, refundPaymentSchema);
      const payment = await refundPayment(body.paymentId, body.amountMinor, user);
      return okResponse(payment);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof PaymentNotFoundError) return errorResponse('PAYMENT_NOT_FOUND', err.message, 404);
      if (err instanceof InvalidPaymentStateError) return errorResponse('INVALID_PAYMENT_STATE', err.message, 409);
      if (err instanceof PaymentGatewayError) return errorResponse('REFUND_FAILED', err.message, 402);
      throw err;
    }
  });
}

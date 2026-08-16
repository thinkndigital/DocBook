import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { cancelAwaitingPayment, PaymentNotFoundError, InvalidPaymentStateError } from '@/lib/services/payments';

/**
 * Releases a payment stuck in AWAITING_REDIRECT (the payer abandoned the hosted page, or
 * never returned) so the front desk can retry collection — otherwise the duplicate-payment
 * guard in collectAppointmentPayment blocks a second attempt on that appointment forever.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['payment:collect', 'billing:manage_tenant'], async (user) => {
    try {
      const payment = await cancelAwaitingPayment(params.id, user);
      return okResponse(payment);
    } catch (err) {
      if (err instanceof PaymentNotFoundError) return errorResponse('PAYMENT_NOT_FOUND', err.message, 404);
      if (err instanceof InvalidPaymentStateError) return errorResponse('INVALID_PAYMENT_STATE', err.message, 409);
      throw err;
    }
  });
}

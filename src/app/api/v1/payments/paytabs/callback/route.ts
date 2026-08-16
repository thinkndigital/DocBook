import type { NextRequest } from 'next/server';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { verifyPaytabsSignature } from '@/lib/payments/paytabs-adapter';
import { finalizeRedirectPayment, PaymentNotFoundError, InvalidPaymentStateError, PaymentGatewayError } from '@/lib/services/payments';

export const dynamic = 'force-dynamic';

/**
 * PayTabs' server-to-server IPN. Public and unauthenticated by necessity — PayTabs has no
 * session with us — so trust comes entirely from the HMAC signature, verified against the
 * *raw* request body before anything is parsed or acted on (see verifyPaytabsSignature).
 *
 * This route never trusts the callback payload's own stated transaction status:
 * finalizeRedirectPayment re-queries PayTabs directly (using our own stored providerRef,
 * not anything from this payload) for the authoritative outcome, so a signature-valid but
 * stale or replayed callback still can't force an incorrect result. The lookup key is our
 * own payment id, echoed back as PayTabs' `cart_id` — not `tran_ref` — since that's the one
 * value both this callback and the browser-return path are guaranteed to agree on.
 */
export async function POST(req: NextRequest) {
  const serverKey = process.env.PAYTABS_SERVER_KEY;
  if (!serverKey) return errorResponse('NOT_CONFIGURED', 'PayTabs is not configured.', 503);

  const rawBody = await req.text();
  const signature = req.headers.get('signature');
  if (!verifyPaytabsSignature(rawBody, signature, serverKey)) {
    return errorResponse('INVALID_SIGNATURE', 'Signature verification failed.', 401);
  }

  let body: { cart_id?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('INVALID_BODY', 'Malformed callback payload.', 400);
  }
  if (!body.cart_id) return errorResponse('INVALID_BODY', 'Missing cart_id.', 400);

  try {
    // No session — this is a verified system caller, not a tenant admin, so it runs
    // outside any tenant context deliberately (the same "no context = bypass" convention
    // /api/v1/admin/* routes rely on): the payment being finalized could belong to any
    // tenant, and PayTabs has no notion of ours.
    await finalizeRedirectPayment(body.cart_id, null);
    return okResponse({ received: true });
  } catch (err) {
    // Not-found / wrong-state aren't retryable by PayTabs resending the same callback
    // (finalizeRedirectPayment is already idempotent for terminal states), so acknowledge
    // rather than making PayTabs retry forever on something re-sending won't fix. A real
    // gateway error, though, gets a 5xx so PayTabs' own retry schedule gets a chance to help.
    if (err instanceof PaymentNotFoundError || err instanceof InvalidPaymentStateError) {
      return okResponse({ received: true });
    }
    if (err instanceof PaymentGatewayError) return errorResponse('GATEWAY_ERROR', err.message, 502);
    throw err;
  }
}

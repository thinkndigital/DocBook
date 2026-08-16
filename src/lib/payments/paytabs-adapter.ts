import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import type { PaymentProvider, PaymentIntentInput, PaymentProviderResult } from '@/lib/payments/provider';

/**
 * PayTabs adapter — targets the real Hosted Payment Page (HPP) API
 * (https://secure.paytabs.com/payment/*), confirmed against PayTabs' public developer
 * docs: POST /payment/request creates a transaction and returns { tran_ref, redirect_url }
 * for card-not-present methods; POST /payment/query re-reads a transaction's authoritative
 * status by tran_ref; refund/void reuse /payment/request with tran_type=refund|void and the
 * original tran_ref. Auth is a raw server key in the `Authorization` header (no Bearer
 * prefix) plus profile_id in the body — PayTabs checks the two match.
 *
 * Only CARD/APPLE_PAY/GOOGLE_PAY actually go through PayTabs. Cash, insurance, bank
 * transfer and corporate billing are settled outside any card network by definition — this
 * adapter records those as an immediate manual success (no HTTP call), the same semantics
 * DevPaymentAdapter already gave every method. Routing a cash payment through a card
 * gateway would be a bug, not a completeness gap.
 *
 * Honesty about verification: this was built against PayTabs' documented request/response
 * field names and the confirmed HMAC-SHA256 IPN signature scheme (server key, entire raw
 * request body, `signature` header). It has been verified end-to-end against a local mock
 * server replicating that exact contract (tests/integration/paytabs-mock-server.ts and
 * paytabs-adapter.test.ts), not against PayTabs' real sandbox — no account exists for this
 * project. Before taking real payments: point PAYTABS_BASE_URL at a real PayTabs sandbox
 * profile and re-run the same live Playwright flow once, to catch any field-level drift
 * between the documented contract and the live one.
 */

const GATEWAY_METHODS = new Set<PaymentMethod>(['CARD', 'APPLE_PAY', 'GOOGLE_PAY']);

// PayTabs transaction outcome codes (payment_result.response_status), as documented:
// A = Authorized/Successful, H = Hold (needs manual review), P = Pending, V = Voided,
// D = Declined, E = Error, C = Cancelled by payer.
const SUCCESS_STATUS = 'A';

interface PayTabsTransactionResponse {
  tran_ref?: string;
  redirect_url?: string;
  cart_id?: string;
  payment_result?: {
    response_status?: string;
    response_code?: string;
    response_message?: string;
  };
  // Some PayTabs endpoints (notably query, in some account configurations) return the
  // status fields flat rather than nested under payment_result — checked as a fallback.
  response_status?: string;
  response_message?: string;
  message?: string;
  code?: string;
}

function manualSuccess(): PaymentProviderResult {
  return { providerRef: `manual_${randomUUID()}`, success: true };
}

function statusOf(body: PayTabsTransactionResponse): { status?: string; message?: string } {
  return {
    status: body.payment_result?.response_status ?? body.response_status,
    message: body.payment_result?.response_message ?? body.response_message ?? body.message,
  };
}

export class PayTabsAdapter implements PaymentProvider {
  readonly id = 'paytabs';

  constructor(
    private readonly profileId: string,
    private readonly serverKey: string,
    private readonly baseUrl: string,
    private readonly callbackBaseUrl: string,
    private readonly returnBaseUrl: string
  ) {}

  private async request(body: Record<string, unknown>, path = '/payment/request'): Promise<PayTabsTransactionResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.serverKey },
      body: JSON.stringify({ profile_id: this.profileId, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as PayTabsTransactionResponse;
    return json;
  }

  async authorize(input: PaymentIntentInput): Promise<PaymentProviderResult> {
    if (input.amountMinor <= 0) {
      return { providerRef: '', success: false, failureReason: 'Amount must be greater than zero.' };
    }
    if (!GATEWAY_METHODS.has(input.method)) return manualSuccess();
    if (!input.paymentId) {
      return { providerRef: '', success: false, failureReason: 'Missing internal payment reference.' };
    }

    let body: PayTabsTransactionResponse;
    try {
      body = await this.request({
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_id: input.paymentId,
        cart_currency: input.currency,
        cart_amount: input.amountMinor / 100,
        cart_description: input.reference,
        customer_details: {
          name: input.customer?.name ?? 'Patient',
          email: input.customer?.email ?? 'no-reply@docbook.local',
          phone: input.customer?.phone ?? '',
          street1: input.customer?.street ?? '',
          city: input.customer?.city ?? '',
          state: input.customer?.city ?? '',
          country: input.customer?.country ?? 'JO',
          zip: '00000',
        },
        hide_shipping: true,
        // Our own payment id travels through as PayTabs' `cart_id` and is echoed back in
        // both the IPN callback body and (appended as a query param, since PayTabs
        // preserves query params on the URLs it's given) the browser return redirect. That
        // makes paymentId — not PayTabs' own tran_ref naming on the return trip, which
        // isn't worth hard-coding a guess at — the one lookup key both paths need to agree on.
        callback: `${this.callbackBaseUrl}?paymentId=${encodeURIComponent(input.paymentId)}`,
        return: `${this.returnBaseUrl}?paymentId=${encodeURIComponent(input.paymentId)}`,
      });
    } catch {
      return { providerRef: '', success: false, failureReason: 'Could not reach the payment gateway.' };
    }

    if (!body.tran_ref || !body.redirect_url) {
      const { message } = statusOf(body);
      return { providerRef: '', success: false, failureReason: message ?? 'Gateway rejected the request.' };
    }

    return { providerRef: body.tran_ref, success: true, pending: true, redirectUrl: body.redirect_url };
  }

  async capture(providerRef: string): Promise<PaymentProviderResult> {
    // A "sale" transaction authorizes and settles in one step at PayTabs — there is no
    // separate capture call to make. Manual methods have already "captured" synchronously
    // in authorize(). This exists only so the interface stays uniform across adapters.
    return { providerRef, success: true };
  }

  async queryStatus(providerRef: string): Promise<PaymentProviderResult> {
    if (providerRef.startsWith('manual_')) return { providerRef, success: true };

    let body: PayTabsTransactionResponse;
    try {
      body = await this.request({ tran_ref: providerRef }, '/payment/query');
    } catch {
      return { providerRef, success: false, failureReason: 'Could not reach the payment gateway.' };
    }

    const { status, message } = statusOf(body);
    if (status === SUCCESS_STATUS) return { providerRef, success: true };
    return { providerRef, success: false, failureReason: message ?? `Transaction status: ${status ?? 'unknown'}` };
  }

  async refund(providerRef: string, amountMinor: number): Promise<PaymentProviderResult> {
    if (amountMinor <= 0) {
      return { providerRef, success: false, failureReason: 'Refund amount must be greater than zero.' };
    }
    if (providerRef.startsWith('manual_')) return { providerRef, success: true };

    let body: PayTabsTransactionResponse;
    try {
      body = await this.request({
        tran_type: 'refund',
        tran_class: 'ecom',
        tran_ref: providerRef,
        cart_id: `refund_${randomUUID()}`,
        cart_currency: 'JOD',
        cart_amount: amountMinor / 100,
        cart_description: 'Refund',
      });
    } catch {
      return { providerRef, success: false, failureReason: 'Could not reach the payment gateway.' };
    }

    const { status, message } = statusOf(body);
    if (status === SUCCESS_STATUS) return { providerRef: body.tran_ref ?? providerRef, success: true };
    return { providerRef, success: false, failureReason: message ?? 'Refund was declined by the gateway.' };
  }

  async void(providerRef: string, amountMinor: number, currency: string): Promise<PaymentProviderResult> {
    if (providerRef.startsWith('manual_')) return { providerRef, success: true };

    let body: PayTabsTransactionResponse;
    try {
      body = await this.request({
        tran_type: 'void',
        tran_class: 'ecom',
        tran_ref: providerRef,
        cart_id: `void_${randomUUID()}`,
        cart_currency: currency,
        cart_amount: amountMinor / 100,
        cart_description: 'Void',
      });
    } catch {
      return { providerRef, success: false, failureReason: 'Could not reach the payment gateway.' };
    }

    const { status, message } = statusOf(body);
    if (status === SUCCESS_STATUS || status === 'V') return { providerRef: body.tran_ref ?? providerRef, success: true };
    return { providerRef, success: false, failureReason: message ?? 'Void was rejected by the gateway.' };
  }
}

/**
 * IPN/callback signature verification (PayTabs Support: "PayTabs sends a custom header
 * Signature including HMAC signature of the entire request body hashed by Profile
 * ServerKey"). Verifies against the *raw* body bytes — the caller must not have
 * re-serialized the JSON before calling this, since re-serialization can reorder keys or
 * change whitespace and would break the hash. Uses a constant-time comparison so this
 * can't be timed to leak the expected signature.
 */
export function verifyPaytabsSignature(rawBody: string, signatureHeader: string | null, serverKey: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', serverKey).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

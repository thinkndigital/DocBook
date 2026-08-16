import type { PaymentMethod } from '@prisma/client';

/**
 * Gateway-agnostic payment contract (brief §15 — do NOT hard-code one gateway).
 *
 * Deliberately models authorize/capture separately rather than a single "charge": card
 * gateways and the cash/insurance flows a Jordanian clinic actually uses both fit this
 * shape (cash authorizes and captures in one step at the front desk; a card may authorize
 * at booking and capture at check-in). Adding a real gateway means writing one adapter,
 * not touching any route or service.
 *
 * A real card-not-present gateway (PayTabs, and most others) cannot authorize synchronously
 * the way DevPaymentAdapter does — it redirects the payer to a hosted page and confirms
 * later via webhook. `PaymentProviderResult.pending`/`redirectUrl` and the optional
 * `queryStatus` method exist for that case without breaking the synchronous contract
 * DevPaymentAdapter and every non-card method (cash/insurance/bank transfer) still use.
 */
export interface PaymentIntentInput {
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  /** Opaque, non-medical description for the gateway's records. Never include diagnosis or clinical detail. */
  reference: string;
  /** Our own Payment row id. Used as the gateway's order/cart reference so a webhook or
   *  return redirect can be tied back to the right row. Required for adapters that make a
   *  real gateway call (e.g. PayTabs); ignored by adapters that don't (dev, manual methods). */
  paymentId?: string;
  /** Best-effort payer contact, sourced from real account data — never fabricated — for
   *  gateways that require customer_details on the request. Optional because not every
   *  adapter needs it. */
  customer?: {
    name: string;
    email: string;
    phone?: string;
    street?: string;
    city?: string;
    country?: string;
  };
}

export interface PaymentProviderResult {
  /** Gateway-side identifier persisted as Payment.providerRef for reconciliation. */
  providerRef: string;
  success: boolean;
  failureReason?: string;
  /** True when the gateway accepted the request but the outcome is not yet known — the
   *  payer must complete an out-of-band step (a hosted payment page). `success` here means
   *  "request accepted", not "money captured"; callers must check `pending` before treating
   *  this as a completed authorization. */
  pending?: boolean;
  /** Present when `pending` is true: where to send the payer's browser to complete payment. */
  redirectUrl?: string;
}

export interface PaymentProvider {
  readonly id: string;
  authorize(input: PaymentIntentInput): Promise<PaymentProviderResult>;
  capture(providerRef: string, amountMinor: number): Promise<PaymentProviderResult>;
  refund(providerRef: string, amountMinor: number): Promise<PaymentProviderResult>;
  void(providerRef: string, amountMinor: number, currency: string): Promise<PaymentProviderResult>;
  /** Ask the gateway for a transaction's authoritative current status. Only meaningful for
   *  adapters that support the `pending`/redirect flow — used to confirm a redirect-based
   *  payment instead of trusting a webhook payload or a browser redirect's query string,
   *  either of which could be replayed or forged. Adapters that never go `pending` (dev,
   *  manual methods) don't need to implement this. */
  queryStatus?(providerRef: string): Promise<PaymentProviderResult>;
}

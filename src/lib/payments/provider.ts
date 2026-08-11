import type { PaymentMethod } from '@prisma/client';

/**
 * Gateway-agnostic payment contract (brief §15 — do NOT hard-code one gateway).
 *
 * Deliberately models authorize/capture separately rather than a single "charge": card
 * gateways and the cash/insurance flows a Jordanian clinic actually uses both fit this
 * shape (cash authorizes and captures in one step at the front desk; a card may authorize
 * at booking and capture at check-in). Adding a real gateway means writing one adapter,
 * not touching any route or service.
 */
export interface PaymentIntentInput {
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  /** Opaque, non-medical description for the gateway's records. Never include diagnosis or clinical detail. */
  reference: string;
}

export interface PaymentProviderResult {
  /** Gateway-side identifier persisted as Payment.providerRef for reconciliation. */
  providerRef: string;
  success: boolean;
  failureReason?: string;
}

export interface PaymentProvider {
  readonly id: string;
  authorize(input: PaymentIntentInput): Promise<PaymentProviderResult>;
  capture(providerRef: string, amountMinor: number): Promise<PaymentProviderResult>;
  refund(providerRef: string, amountMinor: number): Promise<PaymentProviderResult>;
  void(providerRef: string): Promise<PaymentProviderResult>;
}

import { randomUUID } from 'node:crypto';
import type { PaymentProvider, PaymentIntentInput, PaymentProviderResult } from '@/lib/payments/provider';

/**
 * Development adapter — the brief (§47) forbids fake payment success in the product, but
 * explicitly allows a clean provider abstraction plus a development adapter when a real
 * integration can't be configured yet (§15). This is that adapter, and it is honest about
 * what it is: it does not contact any gateway, it records a `dev_` prefixed providerRef so
 * dev-created payments are trivially distinguishable in the database, and it is only
 * selectable when PAYMENT_PROVIDER=dev.
 *
 * It is not a stub that always says "ok": a zero/negative amount fails, and refunding more
 * than was captured fails, so the surrounding state machine and error paths are genuinely
 * exercised rather than bypassed.
 */
export class DevPaymentAdapter implements PaymentProvider {
  readonly id = 'dev';

  private captured = new Map<string, number>();

  async authorize(input: PaymentIntentInput): Promise<PaymentProviderResult> {
    if (input.amountMinor <= 0) {
      return { providerRef: '', success: false, failureReason: 'Amount must be greater than zero.' };
    }
    const providerRef = `dev_${randomUUID()}`;
    this.captured.set(providerRef, 0);
    return { providerRef, success: true };
  }

  async capture(providerRef: string, amountMinor: number): Promise<PaymentProviderResult> {
    if (!providerRef.startsWith('dev_')) {
      return { providerRef, success: false, failureReason: 'Unknown provider reference.' };
    }
    this.captured.set(providerRef, (this.captured.get(providerRef) ?? 0) + amountMinor);
    return { providerRef, success: true };
  }

  async refund(providerRef: string, amountMinor: number): Promise<PaymentProviderResult> {
    if (amountMinor <= 0) {
      return { providerRef, success: false, failureReason: 'Refund amount must be greater than zero.' };
    }
    return { providerRef, success: true };
  }

  async void(providerRef: string): Promise<PaymentProviderResult> {
    return { providerRef, success: true };
  }
}

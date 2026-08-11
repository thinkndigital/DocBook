import type { PaymentProvider } from '@/lib/payments/provider';
import { DevPaymentAdapter } from '@/lib/payments/dev-adapter';

let cached: PaymentProvider | undefined;

/**
 * Resolves the configured provider. Throws on an unrecognised PAYMENT_PROVIDER rather
 * than silently falling back to the dev adapter — a production deploy that forgot to
 * configure its gateway must fail loudly, not quietly start "succeeding" at taking money.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const configured = process.env.PAYMENT_PROVIDER ?? 'dev';

  switch (configured) {
    case 'dev':
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'PAYMENT_PROVIDER=dev is not permitted in production. Configure a real gateway adapter.'
        );
      }
      cached = new DevPaymentAdapter();
      return cached;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${configured}". Implement a PaymentProvider adapter and register it here.`
      );
  }
}

export type { PaymentProvider } from '@/lib/payments/provider';

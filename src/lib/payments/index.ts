import type { PaymentProvider } from '@/lib/payments/provider';
import { DevPaymentAdapter } from '@/lib/payments/dev-adapter';
import { PayTabsAdapter } from '@/lib/payments/paytabs-adapter';
import { absoluteUrl } from '@/lib/seo/site';

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
    case 'paytabs': {
      const profileId = process.env.PAYTABS_PROFILE_ID;
      const serverKey = process.env.PAYTABS_SERVER_KEY;
      if (!profileId || !serverKey) {
        throw new Error(
          'PAYMENT_PROVIDER=paytabs requires PAYTABS_PROFILE_ID and PAYTABS_SERVER_KEY to be set.'
        );
      }
      const baseUrl = (process.env.PAYTABS_BASE_URL ?? 'https://secure.paytabs.com').replace(/\/+$/, '');
      cached = new PayTabsAdapter(
        profileId,
        serverKey,
        baseUrl,
        absoluteUrl('/api/v1/payments/paytabs/callback'),
        absoluteUrl('/tenant/payments/return')
      );
      return cached;
    }
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${configured}". Implement a PaymentProvider adapter and register it here.`
      );
  }
}

/**
 * Test-only escape hatch: points getPaymentProvider() at a specific adapter instance (e.g.
 * a PayTabsAdapter wired to a local mock server) without mutating PAYMENT_PROVIDER or any
 * other process.env var. Integration tests share OS-level worker/fork processes across
 * files for performance, and process.env is a single mutable object for that whole
 * process — a test file that flips PAYMENT_PROVIDER via process.env can leak it into
 * another file's assumptions no matter how carefully it's restored afterward. This mutates
 * only this module's own `cached` variable, which Vitest's per-file module isolation does
 * keep genuinely separate. Never call this from application code.
 */
export function __setPaymentProviderForTests(provider: PaymentProvider | undefined): void {
  cached = provider;
}

export type { PaymentProvider } from '@/lib/payments/provider';

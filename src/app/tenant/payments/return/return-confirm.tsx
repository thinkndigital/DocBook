'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Outcome = 'confirming' | 'paid' | 'failed' | 'error';

/**
 * Lands here after the payer completes (or abandons) PayTabs' hosted page. Reads only our
 * own paymentId out of the return URL — never trusts anything else in the query string,
 * including whatever status PayTabs itself appended, since a payer controls this URL.
 * finalizeRedirectPayment (called via confirm-redirect) re-queries PayTabs directly for the
 * real outcome. This is a convenience for a fast UI response; the webhook is the
 * authoritative confirmation path and will settle the payment even if this tab is closed
 * before the fetch below completes.
 */
export function PaymentReturnConfirm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>('confirming');

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    if (!paymentId) {
      setOutcome('error');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/tenant/payments/confirm-redirect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setOutcome('error');
          return;
        }
        const body = await res.json();
        setOutcome(body?.data?.status === 'PAID' ? 'paid' : 'failed');
      } catch {
        if (!cancelled) setOutcome('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (outcome === 'confirming') return;
    const timer = setTimeout(() => router.replace('/tenant/appointments'), 2500);
    return () => clearTimeout(timer);
  }, [outcome, router]);

  const MESSAGES: Record<Outcome, string> = {
    confirming: 'جارٍ تأكيد الدفعة…',
    paid: 'تم الدفع بنجاح. جارٍ العودة إلى قائمة المواعيد…',
    failed: 'لم تُتم عملية الدفع. جارٍ العودة إلى قائمة المواعيد…',
    error: 'تعذر تأكيد حالة الدفعة. سيتم تأكيدها تلقائياً عند وصول إشعار البوابة، أو يمكنك إعادة المحاولة من قائمة المواعيد.',
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium text-neutral-800">{MESSAGES[outcome]}</p>
      {outcome === 'error' && (
        <button
          type="button"
          onClick={() => router.replace('/tenant/appointments')}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          العودة إلى المواعيد
        </button>
      )}
    </div>
  );
}

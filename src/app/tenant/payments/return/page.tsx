import { Suspense } from 'react';
import { PaymentReturnConfirm } from './return-confirm';

// useSearchParams() inside PaymentReturnConfirm needs a Suspense boundary or Next.js bails
// this route out of static optimization with a build warning — same pattern as /register.
export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-500">جارٍ التحميل…</div>}>
      <PaymentReturnConfirm />
    </Suspense>
  );
}

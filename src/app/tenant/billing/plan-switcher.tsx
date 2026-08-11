'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  name: string;
  priceMonthlyMinor: number;
  currency: string;
  bookingCommissionPct: number;
}

export function PlanSwitcher({ plans, currentPlanId }: { plans: Plan[]; currentPlanId: string | null }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(planId: string) {
    setSubmitting(planId);
    setError(null);
    const res = await fetch('/api/v1/tenant/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? 'تعذر تغيير الخطة.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div
              key={plan.id}
              className={`rounded-lg border p-5 ${isCurrent ? 'border-brand-600 bg-brand-50' : 'border-neutral-200 bg-white'}`}
            >
              <h3 className="font-semibold text-neutral-900">{plan.name}</h3>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {(plan.priceMonthlyMinor / 100).toFixed(2)} {plan.currency}
                <span className="text-sm font-normal text-neutral-500">/شهر</span>
              </p>
              <p className="mt-1 text-sm text-neutral-600">عمولة الحجز: {plan.bookingCommissionPct}%</p>
              <div className="mt-4">
                {isCurrent ? (
                  <span className="text-sm font-medium text-brand-700">الخطة الحالية</span>
                ) : (
                  <Button variant="secondary" disabled={submitting !== null} onClick={() => subscribe(plan.id)}>
                    {submitting === plan.id ? '...' : 'التبديل لهذه الخطة'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

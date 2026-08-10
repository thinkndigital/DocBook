import { Badge } from '@/components/ui/badge';
import { listPlans } from '@/lib/services/plans';
import { NewPlanForm } from './new-plan-form';
import { PlanToggle } from './plan-toggle';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const plans = await listPlans();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">خطط الاشتراك</h1>
      <NewPlanForm />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">{plan.name}</h2>
              <Badge tone={plan.isActive ? 'success' : 'neutral'}>{plan.isActive ? 'مفعّلة' : 'معطّلة'}</Badge>
            </div>
            <p className="mb-1 text-2xl font-bold text-brand-700">
              {(plan.priceMonthlyMinor / 100).toFixed(2)} {plan.currency}
              <span className="text-sm font-normal text-neutral-500">/شهر</span>
            </p>
            <p className="mb-4 text-sm text-neutral-600">عمولة الحجز: {plan.bookingCommissionPct}%</p>
            <PlanToggle planId={plan.id} isActive={plan.isActive} />
          </div>
        ))}
      </div>
    </div>
  );
}

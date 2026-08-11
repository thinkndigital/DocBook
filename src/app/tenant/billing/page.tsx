import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { getCurrentSubscription } from '@/lib/services/subscriptions';
import { listPlans } from '@/lib/services/plans';
import { listTenantPayments } from '@/lib/services/payments';
import { listTenantCommissions } from '@/lib/services/commissions';
import { PlanSwitcher } from './plan-switcher';

export const dynamic = 'force-dynamic';

const PAYMENT_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  AUTHORIZED: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  REFUNDED: 'danger',
  PARTIALLY_REFUNDED: 'warning',
  CANCELLED: 'neutral',
};

const ENTITY_LABEL: Record<string, string> = {
  PLATFORM: 'المنصة',
  REPRESENTATIVE: 'المندوب',
  DOCTOR: 'الطبيب',
  CLINIC: 'الجهة الصحية',
};

export default async function TenantBillingPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session!.user.tenantId!;

  const [subscription, plans, payments, commissions] = await Promise.all([
    getCurrentSubscription(tenantId),
    listPlans(),
    runInSessionTenant(() => listTenantPayments()),
    runInSessionTenant(() => listTenantCommissions(tenantId)),
  ]);

  const earned = commissions
    .filter((c) => c.entityType === 'CLINIC' && c.status !== 'CANCELLED')
    .reduce((sum, c) => sum + c.amountMinor, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الفوترة والاشتراك</h1>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-neutral-900">الاشتراك الحالي</h2>
        {subscription ? (
          <p className="mb-4 text-sm text-neutral-700">
            {subscription.plan.name} — تنتهي الفترة الحالية في{' '}
            {subscription.currentPeriodEnd.toISOString().slice(0, 10)} · عمولة الحجز{' '}
            {subscription.plan.bookingCommissionPct}%
          </p>
        ) : (
          <p className="mb-4 text-sm text-amber-700">لا يوجد اشتراك نشط — اختر خطة أدناه.</p>
        )}
        <PlanSwitcher
          plans={plans.filter((p) => p.isActive)}
          currentPlanId={subscription?.planId ?? null}
        />
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">حصة الجهة من الحجوزات</h2>
          <span className="text-lg font-bold text-brand-700">{(earned / 100).toFixed(2)} JOD</span>
        </div>
        {commissions.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد عمولات محتسبة بعد.</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="text-neutral-600">
              <tr>
                <th className="py-2 font-medium">الجهة المستفيدة</th>
                <th className="py-2 font-medium">المبلغ</th>
                <th className="py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {commissions.slice(0, 20).map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="py-2">{ENTITY_LABEL[c.entityType] ?? c.entityType}</td>
                  <td className="py-2">
                    {(c.amountMinor / 100).toFixed(2)} {c.currency}
                  </td>
                  <td className="py-2 text-neutral-500">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">المدفوعات</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد مدفوعات بعد.</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="text-neutral-600">
              <tr>
                <th className="py-2 font-medium">المبلغ</th>
                <th className="py-2 font-medium">الطريقة</th>
                <th className="py-2 font-medium">المزوّد</th>
                <th className="py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="py-2">
                    {(p.amountMinor / 100).toFixed(2)} {p.currency}
                  </td>
                  <td className="py-2 text-neutral-600">{p.method}</td>
                  <td className="py-2 text-neutral-500">{p.provider}</td>
                  <td className="py-2">
                    <Badge tone={PAYMENT_TONE[p.status]}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

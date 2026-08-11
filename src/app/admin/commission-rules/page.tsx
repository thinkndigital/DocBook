import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listCommissionRules } from '@/lib/services/commissions';
import { listTenants } from '@/lib/services/tenants';
import { CommissionRuleForm } from './rule-form';

export const dynamic = 'force-dynamic';

const ENTITY_LABEL: Record<string, string> = {
  PLATFORM: 'المنصة',
  REPRESENTATIVE: 'المندوب',
  DOCTOR: 'الطبيب',
  CLINIC: 'الجهة الصحية',
};

export default async function CommissionRulesPage() {
  const [rules, { items: tenants }] = await Promise.all([
    listCommissionRules(),
    listTenants({ limit: 100, status: 'ACTIVE' }),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">قواعد العمولات</h1>
      <p className="mb-6 text-sm text-neutral-600">
        القاعدة الخاصة بجهة معيّنة تتقدّم على القاعدة العامة. حصة المنصة تُؤخذ من خطة اشتراك الجهة، وتُستخدم قاعدة
        المنصة هنا فقط عند عدم وجود اشتراك نشط. الجهة الصحية تحصل على المتبقّي بعد باقي الحصص.
      </p>

      <CommissionRuleForm tenants={tenants.map((t) => ({ id: t.id, nameAr: t.nameAr }))} />

      <Card>
        {rules.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد قواعد بعد.</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="text-neutral-600">
              <tr>
                <th className="py-2 font-medium">الجهة المستفيدة</th>
                <th className="py-2 font-medium">النطاق</th>
                <th className="py-2 font-medium">القيمة</th>
                <th className="py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-neutral-100">
                  <td className="py-2">{ENTITY_LABEL[rule.entityType] ?? rule.entityType}</td>
                  <td className="py-2 text-neutral-600">{rule.tenant?.nameAr ?? 'عامة'}</td>
                  <td className="py-2 text-neutral-600">
                    {rule.percentage !== null ? `${rule.percentage}%` : `${((rule.flatAmountMinor ?? 0) / 100).toFixed(2)} JOD`}
                  </td>
                  <td className="py-2">
                    <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'مفعّلة' : 'معطّلة'}</Badge>
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

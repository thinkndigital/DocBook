import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getOwnRepresentative } from '@/lib/services/representatives';
import { listRepCommissions } from '@/lib/services/commissions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
};

export default async function RepCommissionsPage() {
  const session = await getServerSession(authOptions);
  const rep = await getOwnRepresentative(session!.user.id);
  if (!rep) return <p className="text-neutral-600">لا يوجد ملف مندوب مرتبط بهذا الحساب.</p>;

  const { commissions, paidMinor, pendingMinor } = await listRepCommissions(rep.id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">عمولاتي</h1>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <div className="text-2xl font-bold text-amber-600">{(pendingMinor / 100).toFixed(2)} JOD</div>
          <div className="mt-1 text-sm text-neutral-600">عمولات مستحقة</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-emerald-700">{(paidMinor / 100).toFixed(2)} JOD</div>
          <div className="mt-1 text-sm text-neutral-600">عمولات مدفوعة</div>
        </Card>
      </div>

      <Card>
        {commissions.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد عمولات بعد — تُحتسب العمولة عند تحصيل قيمة الحجز.</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="text-neutral-600">
              <tr>
                <th className="py-2 font-medium">المريض</th>
                <th className="py-2 font-medium">الطبيب</th>
                <th className="py-2 font-medium">قيمة الحجز</th>
                <th className="py-2 font-medium">العمولة</th>
                <th className="py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="py-2">{c.appointment.patient.user.name}</td>
                  <td className="py-2 text-neutral-600">{c.appointment.doctor.user.name}</td>
                  <td className="py-2 text-neutral-600">{(c.appointment.priceMinor / 100).toFixed(2)}</td>
                  <td className="py-2 font-medium text-brand-700">
                    {(c.amountMinor / 100).toFixed(2)} {c.currency}
                  </td>
                  <td className="py-2">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
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

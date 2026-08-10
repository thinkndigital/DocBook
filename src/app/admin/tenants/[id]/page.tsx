import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTenant } from '@/lib/services/tenants';
import { TenantStatusActions } from './tenant-status-actions';
import type { TenantStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<TenantStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  REJECTED: 'neutral',
};

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getTenant(params.id);
  if (!tenant) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{tenant.nameAr}</h1>
        <Badge tone={STATUS_TONE[tenant.status]}>{tenant.status}</Badge>
      </div>

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">النوع</dt>
            <dd className="font-medium">{tenant.type}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">الدولة</dt>
            <dd className="font-medium">{tenant.country.nameAr}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">الفروع</dt>
            <dd className="font-medium">{tenant._count.branches}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">الأطباء</dt>
            <dd className="font-medium">{tenant._count.doctors}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">المواعيد</dt>
            <dd className="font-medium">{tenant._count.appointments}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold text-neutral-900">مدير الجهة</h2>
        {tenant.users.length === 0 ? (
          <p className="text-sm text-neutral-500">لا يوجد مدير مسجل.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {tenant.users.map((u) => (
              <li key={u.id} className="flex justify-between">
                <span>
                  {u.name} — {u.email}
                </span>
                <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>{u.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TenantStatusActions tenantId={tenant.id} status={tenant.status} />
    </div>
  );
}

import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTenant } from '@/lib/services/tenants';
import { ResetPasswordButton } from '@/components/admin/reset-password-button';
import { TenantStatusActions } from './tenant-status-actions';
import type { TenantStatus, UserStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<TenantStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  REJECTED: 'neutral',
};

// Same labels as /admin/tenants — this page previously rendered the raw enum (e.g. "ACTIVE",
// "PENDING_VERIFICATION") instead of Arabic text, the one spot in an otherwise Arabic-only
// admin portal that did.
const STATUS_LABEL: Record<TenantStatus, string> = {
  PENDING_VERIFICATION: 'بانتظار التحقق',
  ACTIVE: 'نشطة',
  SUSPENDED: 'موقوفة',
  REJECTED: 'مرفوضة',
};

const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'نشط',
  INVITED: 'مدعو',
  SUSPENDED: 'موقوف',
  DEACTIVATED: 'معطّل',
};

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getTenant(params.id);
  if (!tenant) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{tenant.nameAr}</h1>
        <Badge tone={STATUS_TONE[tenant.status]}>{STATUS_LABEL[tenant.status]}</Badge>
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
              <li key={u.id} className="flex items-center justify-between gap-3">
                <span>
                  {u.name} — {u.email}
                </span>
                <div className="flex items-center gap-3">
                  <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>{USER_STATUS_LABEL[u.status]}</Badge>
                  <ResetPasswordButton endpoint={`/api/v1/admin/tenants/${tenant.id}/admin-password`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TenantStatusActions tenantId={tenant.id} status={tenant.status} />
    </div>
  );
}

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { listTenants } from '@/lib/services/tenants';
import { listCountries } from '@/lib/services/geography';
import { NewTenantForm } from './new-tenant-form';
import type { TenantStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<TenantStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  REJECTED: 'neutral',
};

const STATUS_LABEL: Record<TenantStatus, string> = {
  PENDING_VERIFICATION: 'بانتظار التحقق',
  ACTIVE: 'نشطة',
  SUSPENDED: 'موقوفة',
  REJECTED: 'مرفوضة',
};

export default async function TenantsPage() {
  const [{ items: tenants }, countries] = await Promise.all([listTenants({ limit: 50 }), listCountries()]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الجهات الصحية</h1>
      <NewTenantForm countries={countries} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">النوع</th>
              <th className="px-4 py-3 font-medium">الدولة</th>
              <th className="px-4 py-3 font-medium">الفروع</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد جهات صحية بعد.
                </td>
              </tr>
            )}
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/tenants/${tenant.id}`} className="font-medium text-brand-700 hover:underline">
                    {tenant.nameAr}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{tenant.type}</td>
                <td className="px-4 py-3 text-neutral-600">{tenant.country.nameAr}</td>
                <td className="px-4 py-3 text-neutral-600">{tenant._count.branches}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[tenant.status]}>{STATUS_LABEL[tenant.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

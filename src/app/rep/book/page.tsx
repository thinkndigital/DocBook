import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnRepresentative, listAssignedTenants, listRepBookableServices } from '@/lib/services/representatives';
import { RepBookingForm } from './rep-booking-form';

export const dynamic = 'force-dynamic';

export default async function RepBookPage() {
  const session = await getServerSession(authOptions);
  const rep = await getOwnRepresentative(session!.user.id);
  if (!rep) return <p className="text-neutral-600">لا يوجد ملف مندوب مرتبط بهذا الحساب.</p>;

  const [tenants, services] = await Promise.all([listAssignedTenants(rep.id), listRepBookableServices(rep.id)]);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">حجز موعد لمريض</h1>
      {tenants.length === 0 ? (
        <p className="text-sm text-amber-700">لا توجد جهات صحية مسندة إليك بعد.</p>
      ) : (
        <RepBookingForm
          tenants={tenants.map((t) => ({ id: t.id, nameAr: t.nameAr }))}
          services={services.map((s) => ({ id: s.id, nameAr: s.nameAr, tenantId: s.tenantId }))}
        />
      )}
    </div>
  );
}

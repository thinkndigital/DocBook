import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { listServices } from '@/lib/services/catalog';
import { NewServiceForm } from './new-service-form';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const services = await runInSessionTenant(() => listServices());

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الخدمات</h1>
      <NewServiceForm />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {services.length === 0 && <p className="text-sm text-neutral-500">لا توجد خدمات بعد.</p>}
        {services.map((service) => (
          <div key={service.id} className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold text-neutral-900">{service.nameAr}</h2>
            <p className="mt-1 text-lg font-bold text-brand-700">
              {(service.priceMinor / 100).toFixed(2)} {service.currency}
            </p>
            <p className="mt-1 text-sm text-neutral-500">{service.durationMinutes} دقيقة</p>
          </div>
        ))}
      </div>
    </div>
  );
}

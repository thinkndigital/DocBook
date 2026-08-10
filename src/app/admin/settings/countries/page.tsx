import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { listCountries } from '@/lib/services/geography';
import { NewCountryForm } from './new-country-form';

export const dynamic = 'force-dynamic';

export default async function CountriesPage() {
  const countries = await listCountries();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الدول والمدن</h1>
      <NewCountryForm />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الدولة</th>
              <th className="px-4 py-3 font-medium">الرمز</th>
              <th className="px-4 py-3 font-medium">العملة</th>
              <th className="px-4 py-3 font-medium">المدن</th>
              <th className="px-4 py-3 font-medium">الجهات</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/settings/countries/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.nameAr}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{c.code}</td>
                <td className="px-4 py-3 text-neutral-600">{c.currency}</td>
                <td className="px-4 py-3 text-neutral-600">{c._count.cities}</td>
                <td className="px-4 py-3 text-neutral-600">{c._count.tenants}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'مفعّلة' : 'معطّلة'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

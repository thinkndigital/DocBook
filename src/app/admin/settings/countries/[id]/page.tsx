import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { db } from '@/lib/db';
import { listCities } from '@/lib/services/geography';
import { NewCityForm } from './new-city-form';

export const dynamic = 'force-dynamic';

export default async function CountryDetailPage({ params }: { params: { id: string } }) {
  const country = await db.country.findUnique({ where: { id: params.id } });
  if (!country) notFound();

  const cities = await listCities(country.id);

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">{country.nameAr}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {country.currency} · {country.phonePrefix} · {country.timezone}
      </p>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">المدن</h2>
        <NewCityForm countryId={country.id} />
        {cities.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد مدن مضافة بعد.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {cities.map((city) => (
              <li key={city.id} className="rounded-md bg-neutral-50 px-3 py-2">
                {city.nameAr}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

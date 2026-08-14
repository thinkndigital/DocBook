import type { Metadata } from 'next';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { listPublicCities } from '@/lib/services/marketplace';
import { db } from '@/lib/db';
import { alternatesFor } from '@/lib/seo/site';
import { PartnerForm } from './partner-form';

/** Reference data only — same cache posture as the home page. */
export const revalidate = 3600;

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const dict = getDictionary(params.locale);
  return {
    title: dict.partner.title,
    description: dict.home.clinicsBody,
    alternates: alternatesFor(params.locale, '/for-clinics'),
  };
}

export default async function ForClinicsPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);

  // Unreachable during `next build` by design; the form still renders and the selects fill
  // in on the first revalidation after deploy.
  let countries: Array<{ id: string; name: string; nameAr: string }> = [];
  let cities: Awaited<ReturnType<typeof listPublicCities>> = [];
  try {
    [countries, cities] = await Promise.all([
      db.country.findMany({ where: { isActive: true }, select: { id: true, name: true, nameAr: true } }),
      listPublicCities(),
    ]);
  } catch {
    /* form-only render */
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">{dict.partner.title}</h1>
      <p className="mb-8 text-neutral-600">{dict.partner.intro}</p>
      <PartnerForm
        locale={params.locale}
        dict={dict}
        countries={countries}
        cities={cities.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, countryId: c.countryId }))}
      />
    </div>
  );
}

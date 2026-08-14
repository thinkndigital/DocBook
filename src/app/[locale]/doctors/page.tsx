import Link from 'next/link';
import type { Metadata } from 'next';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { alternatesFor } from '@/lib/seo/site';
import { searchDoctors, listPublicSpecialties, listPublicCities } from '@/lib/services/marketplace';
import { Badge } from '@/components/ui/badge';

// Stays request-rendered: the results are driven by searchParams, so there is no shared
// output to cache. The canonical below is the *unfiltered* URL, so the same doctor reached
// through a dozen filter combinations consolidates into one indexed page instead of a
// dozen near-duplicates competing with each other.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const dict = getDictionary(params.locale);
  return {
    title: dict.seo.doctorsTitle,
    description: dict.seo.doctorsDescription,
    alternates: alternatesFor(params.locale, '/doctors'),
  };
}

export default async function DoctorsSearchPage({
  params,
  searchParams,
}: {
  params: { locale: Locale };
  searchParams: { specialty?: string; cityId?: string; gender?: string; q?: string };
}) {
  const dict = getDictionary(params.locale);
  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';

  const [{ items: doctors }, specialties, cities] = await Promise.all([
    searchDoctors({
      specialtySlug: searchParams.specialty,
      cityId: searchParams.cityId,
      gender: searchParams.gender as 'MALE' | 'FEMALE' | undefined,
      query: searchParams.q,
      limit: 20,
    }),
    listPublicSpecialties(),
    listPublicCities(),
  ]);

  return (
    <div>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.seo.breadcrumbHome, path: `/${params.locale}` },
          { name: dict.seo.breadcrumbDoctors, path: `/${params.locale}/doctors` },
        ])}
      />
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{dict.doctors.title}</h1>

      <form className="mb-8 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-4" method="get">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder={dict.common.search}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2 md:col-span-1"
        />
        <select name="specialty" defaultValue={searchParams.specialty ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">{dict.doctors.allSpecialties}</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.slug}>
              {s[nameKey]}
            </option>
          ))}
        </select>
        <select name="cityId" defaultValue={searchParams.cityId ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">{dict.doctors.allCities}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c[nameKey]}
            </option>
          ))}
        </select>
        <select name="gender" defaultValue={searchParams.gender ?? ''} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">{dict.doctors.anyGender}</option>
          <option value="MALE">{dict.doctors.male}</option>
          <option value="FEMALE">{dict.doctors.female}</option>
        </select>
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-3 text-sm text-white sm:col-span-2 md:col-span-4 md:py-2">
          {dict.common.search}
        </button>
      </form>

      {doctors.length === 0 ? (
        <p className="text-neutral-500">{dict.doctors.noResults}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doctor) => (
            <Link
              key={doctor.id}
              href={`/${params.locale}/doctors/${doctor.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-brand-400"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900">{doctor.user[nameKey] ?? doctor.user.name}</h2>
                {doctor.verified && <Badge tone="success">{dict.doctors.verified}</Badge>}
              </div>
              <p className="text-sm text-neutral-600">{doctor.specialty[nameKey]}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {doctor.branches.map((b) => b.branch.city[nameKey]).join('، ')}
              </p>
              <p className="mt-3 font-medium text-brand-700">
                {(doctor.consultationPriceMinor / 100).toFixed(2)} {doctor.currency} — {dict.doctors.consultationFee}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

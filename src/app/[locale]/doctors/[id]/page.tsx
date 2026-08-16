import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { getPublicDoctor, listDoctorBookableServices } from '@/lib/services/marketplace';
import { Badge } from '@/components/ui/badge';
import { RatingBadge } from '@/components/marketplace/rating-badge';
import { JsonLd } from '@/components/seo/json-ld';
import { physicianJsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { alternatesFor } from '@/lib/seo/site';
import { BookingWidget } from './booking-widget';

/**
 * Cached and revalidated rather than rendered per request.
 *
 * This is the page crawlers index and the page a patient lands on from search, and nothing
 * on it is personal: name, specialty, clinic, fee. It previously carried
 * `dynamic = 'force-dynamic'` because it read the session to decide whether the booking
 * widget should offer to book or to sign in — one boolean, at the cost of a database round
 * trip on every visit. That decision now happens inside the widget, which is a client
 * component and already fetches availability separately.
 *
 * Ten minutes is chosen against what actually changes here: a fee edit or a new branch can
 * lag by that much without misleading anyone. Availability cannot, and does not go through
 * this cache — the widget calls the availability API live, so a slot is never offered from
 * a stale render.
 */
export const revalidate = 600;

/**
 * Returns nothing on purpose, and is still required.
 *
 * `revalidate` alone does not put a dynamic segment into the prerender manifest — without
 * this, Next treats `[id]` as fully request-rendered and the cache never engages, which is
 * exactly what the first attempt at this produced. Declaring `generateStaticParams`
 * registers the route for on-demand incremental regeneration: the first request for a
 * profile renders it, and the next ten minutes of requests are served from cache.
 *
 * It cannot enumerate real ids: this runs during `next build`, where `DATABASE_URL` does
 * not exist (secrets are RUNTIME-only — see apphosting.yaml). Querying here would trade a
 * cold first request per doctor for a build that fails outright.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale; id: string };
}): Promise<Metadata> {
  const dict = getDictionary(params.locale);
  const doctor = await getPublicDoctor(params.id);

  // Unverified, soft-deleted, or a suspended clinic: the page renders a 404, so the
  // metadata must not describe a doctor. Returning a noindex stub keeps a stale link from
  // putting a real practitioner's name on an error page.
  if (!doctor) {
    return { title: dict.common.back, robots: { index: false, follow: false } };
  }

  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';
  const name = doctor.user[nameKey] ?? doctor.user.name;
  const specialty = doctor.specialty[nameKey];

  const title = dict.seo.doctorTitleTemplate.replace('{name}', name).replace('{specialty}', specialty);
  const description = dict.seo.doctorDescriptionTemplate
    .replace('{name}', name)
    .replace('{specialty}', specialty);

  return {
    title,
    description,
    alternates: alternatesFor(params.locale, `/doctors/${params.id}`),
    openGraph: { title, description, type: 'profile' },
  };
}

export default async function DoctorProfilePage({ params }: { params: { locale: Locale; id: string } }) {
  const dict = getDictionary(params.locale);
  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';

  const doctor = await getPublicDoctor(params.id);
  if (!doctor) notFound();

  const services = await listDoctorBookableServices(params.id);

  const displayName = doctor.user[nameKey] ?? doctor.user.name;
  const bio = params.locale === 'ar' ? doctor.bioAr ?? doctor.bio : doctor.bio ?? doctor.bioAr;
  const branches = doctor.branches.map((b) => ({
    id: b.branch.id,
    name: b.branch.name,
    nameAr: b.branch.name,
    city: b.branch.city,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <JsonLd
        data={[
          physicianJsonLd({
            id: params.id,
            locale: params.locale,
            name: displayName,
            specialty: doctor.specialty[nameKey],
            bio,
            yearsExperience: doctor.yearsExperience,
            gender: doctor.gender,
            languages: doctor.languages,
            priceMinor: doctor.consultationPriceMinor,
            currency: doctor.currency,
            ratingAverage: doctor.ratingAverage,
            ratingCount: doctor.ratingCount,
            clinicName: doctor.tenant[nameKey] ?? doctor.tenant.name,
            branches: branches.map((b) => ({ name: b.name, city: b.city[nameKey] })),
          }),
          breadcrumbJsonLd([
            { name: dict.seo.breadcrumbHome, path: `/${params.locale}` },
            { name: dict.seo.breadcrumbDoctors, path: `/${params.locale}/doctors` },
            { name: displayName, path: `/${params.locale}/doctors/${params.id}` },
          ]),
        ]}
      />

      <div className="md:col-span-2">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">{displayName}</h1>
          {doctor.verified && <Badge tone="success">{dict.doctors.verified}</Badge>}
        </div>
        <p className="mb-1 text-neutral-600">{doctor.specialty[nameKey]}</p>
        <div className="mb-1">
          <RatingBadge ratingAverage={doctor.ratingAverage} ratingCount={doctor.ratingCount} reviewsLabel={dict.doctors.reviewsCount} />
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          {doctor.yearsExperience} {dict.doctors.yearsExperience}
        </p>

        {bio && (
          <div className="mb-6">
            <h2 className="mb-1 font-semibold text-neutral-900">{dict.doctorProfile.about}</h2>
            <p className="text-sm text-neutral-700">{bio}</p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-900">{dict.doctorProfile.branches}</h2>
          <ul className="flex flex-col gap-1 text-sm text-neutral-700">
            {branches.map((b) => (
              <li key={b.id}>
                {b.name} — {b.city[nameKey]}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-lg font-bold text-brand-700">
          {(doctor.consultationPriceMinor / 100).toFixed(2)} {doctor.currency}
          <span className="text-sm font-normal text-neutral-500"> — {dict.doctors.consultationFee}</span>
        </p>
      </div>

      <div>
        {branches.length === 0 || services.length === 0 ? (
          <p className="text-sm text-neutral-500">{dict.doctorProfile.noSlots}</p>
        ) : (
          <BookingWidget
            locale={params.locale}
            dict={dict}
            doctorId={params.id}
            branches={branches}
            services={services}
          />
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { listPublicSpecialties, listPublicCities } from '@/lib/services/marketplace';
import { alternatesFor } from '@/lib/seo/site';

/**
 * Cached for an hour rather than rendered per request.
 *
 * The only data here is the specialty and city lists — reference rows that change when
 * someone adds a city, not per visitor. This is also the page most first-time traffic
 * lands on, so it is the one where a database round trip per view costs the most.
 */
export const revalidate = 3600;

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const dict = getDictionary(params.locale);
  return {
    // Absolute: the layout's template appends the site name, and the home page already
    // carries it — "DocBook — DocBook" is what the template would otherwise produce.
    title: { absolute: `${dict.seo.siteName} — ${dict.seo.homeTitle}` },
    description: dict.seo.siteDescription,
    alternates: alternatesFor(params.locale, '/'),
  };
}

export default async function MarketplaceHomePage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);
  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';

  // The database is unreachable during `next build` (secrets are RUNTIME-only on App
  // Hosting, by design). Falling back to empty lists keeps the build alive and lets the
  // first revalidation after deploy fill the sections in; the sections themselves are
  // skipped rather than rendered empty, so the page degrades to the hero and never shows
  // an "explore specialties" heading above nothing.
  let specialties: Awaited<ReturnType<typeof listPublicSpecialties>> = [];
  let cities: Awaited<ReturnType<typeof listPublicCities>> = [];
  try {
    [specialties, cities] = await Promise.all([listPublicSpecialties(), listPublicCities()]);
  } catch {
    /* hero-only render */
  }

  const doctorsHref = `/${params.locale}/doctors`;

  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      {/* Hero — the search box is a plain GET form so it works before hydration and is
          crawlable as a link to the search page. */}
      <section className="pt-4 text-center sm:pt-8">
        <h1 className="text-3xl font-bold leading-tight text-neutral-900 sm:text-4xl">
          {dict.home.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-600">{dict.home.subtitle}</p>

        <form
          action={doctorsHref}
          method="get"
          className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            name="q"
            aria-label={dict.home.searchPlaceholder}
            placeholder={dict.home.searchPlaceholder}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-4 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            {dict.home.searchCta}
          </button>
        </form>
      </section>

      {specialties.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-neutral-900">{dict.home.browseSpecialties}</h2>
            <Link href={doctorsHref} className="whitespace-nowrap text-sm text-brand-700 hover:underline">
              {dict.home.viewAllDoctors}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {specialties.map((specialty) => (
              <Link
                key={specialty.id}
                href={`${doctorsHref}?specialty=${encodeURIComponent(specialty.slug)}`}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800 hover:border-brand-400 hover:text-brand-700"
              >
                {specialty[nameKey]}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-6 text-xl font-bold text-neutral-900">{dict.home.howItWorksTitle}</h2>
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { n: 1, title: dict.home.step1Title, body: dict.home.step1Body },
            { n: 2, title: dict.home.step2Title, body: dict.home.step2Body },
            { n: 3, title: dict.home.step3Title, body: dict.home.step3Body },
          ].map((step) => (
            <li key={step.n} className="rounded-lg border border-neutral-200 bg-white p-5">
              <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {step.n}
              </span>
              <h3 className="mb-1 font-semibold text-neutral-900">{step.title}</h3>
              <p className="text-sm text-neutral-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Every claim below is one the product actually enforces: verification gates search
          visibility, the fee is on the profile before booking, and clinical rows are
          encrypted and gated on a treatment relationship. Nothing here is aspirational. */}
      <section>
        <h2 className="mb-6 text-xl font-bold text-neutral-900">{dict.home.trustTitle}</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { title: dict.home.trustVerified, body: dict.home.trustVerifiedBody },
            { title: dict.home.trustPricing, body: dict.home.trustPricingBody },
            { title: dict.home.trustRecords, body: dict.home.trustRecordsBody },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="mb-1 font-semibold text-neutral-900">{item.title}</h3>
              <p className="text-sm text-neutral-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-bold text-neutral-900">{dict.home.symptomTitle}</h2>
        <p className="mt-2 text-sm text-neutral-700">{dict.home.symptomBody}</p>
        <Link
          href={`/${params.locale}/symptom-check`}
          className="mt-4 inline-block rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {dict.home.symptomCta}
        </Link>
        {/* Carried here as well as on the tool itself: this is the first place a patient
            meets the feature, and the emergency instruction must not be one click away. */}
        <p className="mt-3 text-xs text-neutral-600">{dict.home.symptomDisclaimer}</p>
      </section>

      {cities.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-neutral-900">{dict.home.browseCities}</h2>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <Link
                key={city.id}
                href={`${doctorsHref}?cityId=${encodeURIComponent(city.id)}`}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 hover:border-brand-400 hover:text-brand-700"
              >
                {city[nameKey]}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Doctors/clinics/hospitals/suppliers all have real, instant self-registration
          (src/app/[locale]/register) — this section links straight to it. It's deliberately
          separate from the "apply to join" card below, which is a reviewed lead-capture form
          for clinics/hospitals that would rather talk to someone first than self-serve. */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-bold text-neutral-900">{dict.home.joinTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">{dict.home.joinBody}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/${params.locale}/register?role=DOCTOR`}
            className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {dict.home.joinAsDoctor}
          </Link>
          <Link
            href={`/${params.locale}/register?role=CLINIC`}
            className="rounded-md border border-brand-600 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {dict.home.joinAsClinic}
          </Link>
          <Link
            href={`/${params.locale}/register?role=CLINIC&type=HOSPITAL`}
            className="rounded-md border border-brand-600 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {dict.home.joinAsHospital}
          </Link>
          <Link
            href={`/${params.locale}/register?role=SUPPLIER`}
            className="rounded-md border border-brand-600 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {dict.home.joinAsSupplier}
          </Link>
        </div>
      </section>

      {/* The button leads to an application form, not a sign-up: no account is created and
          nothing is granted until a human reviews it. That distinction is the reason a
          public form can exist here at all — see src/lib/services/partner-applications.ts. */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-bold text-neutral-900">{dict.home.clinicsTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">{dict.home.clinicsBody}</p>
        <Link
          href={`/${params.locale}/for-clinics`}
          className="mt-4 inline-block rounded-md border border-brand-600 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          {dict.home.clinicsCta}
        </Link>
      </section>
    </div>
  );
}

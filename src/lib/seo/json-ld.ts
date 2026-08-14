import { absoluteUrl, siteUrl } from '@/lib/seo/site';
import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * Structured data for the public marketplace.
 *
 * One rule governs this file: **never emit a property we cannot substantiate from a real
 * row.** Structured data is a machine-readable claim made to search engines and, through
 * rich results, to patients. Padding it with a default `aggregateRating`, an invented
 * `priceRange`, or a `MedicalSpecialty` we guessed is not an SEO trick with a mild
 * downside — for a healthcare listing it is a false statement about a real clinician, and
 * it is the kind of thing that gets a domain's rich results pulled entirely.
 *
 * So every builder below takes real values and omits the property when the value is
 * absent. `aggregateRating` in particular only appears when `ratingCount > 0`; a doctor
 * nobody has rated gets no rating block rather than a zero.
 */

interface JsonLdObject {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
}

/** Drops undefined/null/empty entries so no half-populated property reaches the output. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
  ) as T;
}

export function organizationJsonLd(locale: Locale): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: 'DocBook',
    url: absoluteUrl(`/${locale}`),
    description:
      locale === 'ar'
        ? 'منصة لحجز مواعيد الأطباء والعيادات والمستشفيات.'
        : 'A platform for booking appointments with doctors, clinics and hospitals.',
  };
}

export function webSiteJsonLd(locale: Locale): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}/#website`,
    name: 'DocBook',
    url: absoluteUrl(`/${locale}`),
    inLanguage: locale,
    publisher: { '@id': `${siteUrl()}/#organization` },
    // Describes the search page that already exists; it is not a promise of a feature.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl(`/${locale}/doctors?q={search_term_string}`),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export interface DoctorJsonLdInput {
  id: string;
  locale: Locale;
  name: string;
  specialty: string;
  bio?: string | null;
  yearsExperience?: number | null;
  gender?: 'MALE' | 'FEMALE' | null;
  languages?: string[];
  priceMinor: number;
  currency: string;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  clinicName: string;
  branches: Array<{ name: string; city: string }>;
}

/**
 * schema.org `Physician`, which is both a `MedicalBusiness` and a `LocalBusiness` — the
 * type search engines use for a bookable practitioner listing.
 *
 * `medicalSpecialty` is left as the free-text specialty name rather than mapped onto
 * schema.org's `MedicalSpecialty` enumeration: that mapping would be a guess for anything
 * outside the enumeration's vocabulary, and a wrong specialty on a doctor's listing is the
 * single most harmful thing this file could emit.
 */
export function physicianJsonLd(input: DoctorJsonLdInput): JsonLdObject {
  const url = absoluteUrl(`/${input.locale}/doctors/${input.id}`);

  const areaServed = [...new Set(input.branches.map((b) => b.city))];

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Physician',
    '@id': `${url}#physician`,
    url,
    name: input.name,
    description: input.bio ?? undefined,
    medicalSpecialty: input.specialty,
    gender: input.gender === 'MALE' ? 'Male' : input.gender === 'FEMALE' ? 'Female' : undefined,
    knowsLanguage: input.languages?.length ? input.languages : undefined,
    memberOf: compact({ '@type': 'Organization', name: input.clinicName }),
    areaServed: areaServed.length ? areaServed : undefined,
    // Minor units are the storage format everywhere in this codebase; schema.org wants a
    // decimal amount, so the conversion happens here rather than leaking a fils figure
    // into search results as though it were dinars.
    offers: compact({
      '@type': 'Offer',
      price: (input.priceMinor / 100).toFixed(2),
      priceCurrency: input.currency,
      availability: 'https://schema.org/InStock',
      url,
    }),
    // Only when someone has actually rated them. A 0-of-0 rating block is a lie that
    // search engines will happily render as stars.
    aggregateRating:
      input.ratingCount && input.ratingCount > 0 && input.ratingAverage != null
        ? {
            '@type': 'AggregateRating',
            ratingValue: input.ratingAverage,
            reviewCount: input.ratingCount,
          }
        : undefined,
    isAcceptingNewPatients: true,
  });
}

/**
 * Serialises for embedding in `<script type="application/ld+json">`.
 *
 * `<` is escaped because a name or bio containing `</script>` would otherwise close the
 * tag early and turn stored text into markup — the one XSS route a JSON-LD block has.
 * (The CSP allows this inline script via `script-src 'unsafe-inline'`; see next.config.js
 * for why that is currently the policy.)
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

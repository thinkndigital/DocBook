import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/site';
import { locales, defaultLocale } from '@/lib/i18n/dictionaries';
import { listIndexableDoctors, listPublicSpecialties } from '@/lib/services/marketplace';

/**
 * Regenerated hourly rather than per request. A sitemap is polled by crawlers on their own
 * schedule, so serving one that is up to an hour stale costs nothing, while running a
 * full table scan of every doctor on each hit is a free denial-of-service for anyone who
 * knows the URL.
 */
export const revalidate = 3600;

/** hreflang alternates, so ar/en profiles are understood as one page in two languages. */
function withAlternates(pathWithoutLocale: string) {
  const suffix = pathWithoutLocale === '/' ? '' : pathWithoutLocale;
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = absoluteUrl(`/${locale}${suffix}`);
  return { languages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPaths: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/doctors', priority: 0.9, changeFrequency: 'daily' },
    { path: '/symptom-check', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/for-clinics', priority: 0.5, changeFrequency: 'weekly' },
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(`/${defaultLocale}${path === '/' ? '' : path}`),
    lastModified: now,
    changeFrequency,
    priority,
    alternates: withAlternates(path),
  }));

  // The database is unreachable during `next build` (secrets are RUNTIME-only on App
  // Hosting, by design — see apphosting.yaml). A sitemap that throws would fail the build
  // over content that is regenerated an hour later anyway, so fall back to the static
  // entries and let the first post-deploy revalidation fill in the rest.
  let doctors: Awaited<ReturnType<typeof listIndexableDoctors>> = [];
  let specialties: Awaited<ReturnType<typeof listPublicSpecialties>> = [];
  try {
    [doctors, specialties] = await Promise.all([listIndexableDoctors(), listPublicSpecialties()]);
  } catch {
    return entries;
  }

  for (const specialty of specialties) {
    entries.push({
      url: absoluteUrl(`/${defaultLocale}/doctors?specialty=${encodeURIComponent(specialty.slug)}`),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: withAlternates(`/doctors?specialty=${encodeURIComponent(specialty.slug)}`),
    });
  }

  for (const doctor of doctors) {
    entries.push({
      url: absoluteUrl(`/${defaultLocale}/doctors/${doctor.id}`),
      lastModified: doctor.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: withAlternates(`/doctors/${doctor.id}`),
    });
  }

  return entries;
}

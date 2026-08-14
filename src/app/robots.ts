import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/site';

/**
 * What may be crawled.
 *
 * The allow-list is small on purpose: only the public marketplace — search, doctor
 * profiles, the symptom checker — is meant to be indexed. Everything else is either an
 * authenticated surface or a patient's own data.
 *
 * `Disallow` is not an access control and is not treated as one anywhere in this codebase;
 * every path below is already behind authentication and RBAC. What it prevents is a
 * *different* failure: a crawler following a link into `/patient/records`, being served the
 * login page, and indexing that URL — after which the address of a patient-data route is
 * public, and any future auth mistake on it is discovered by search rather than by us. The
 * per-page `robots: { index: false }` in those routes' metadata is the second layer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/tenant',
          '/tenant/',
          '/doctor',
          '/doctor/',
          '/rep',
          '/rep/',
          '/login',
          // Locale-prefixed patient surfaces: appointments, health records, notifications.
          '/ar/patient/',
          '/en/patient/',
          '/ar/login',
          '/en/login',
          '/ar/register',
          '/en/register',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}

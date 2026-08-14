import { locales, defaultLocale, type Locale } from '@/lib/i18n/dictionaries';

/**
 * The public origin, used for canonical URLs, hreflang alternates, the sitemap and
 * structured data.
 *
 * Every one of those is a *cross-document* claim: a canonical tag pointing at the wrong
 * host tells a search engine that this page is a duplicate of one somewhere else, and a
 * sitemap full of localhost URLs is silently discarded. So this resolves from real
 * configuration rather than being inferred per-request from the Host header, which an
 * attacker controls and a CDN rewrites.
 *
 * `NEXTAUTH_URL` is the fallback because deployment already requires it to be the exact
 * public URL (NextAuth builds callbacks from it), so there is one value to get right rather
 * than two that can drift apart.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL;

  if (!configured) {
    // This is read during `next build` as well as at runtime: robots.txt, the sitemap and
    // `metadataBase` are all baked into statically rendered output. A production build
    // without it therefore ships canonical tags and a sitemap pointing at localhost —
    // which does not error, does not fail a health check, and quietly tells search engines
    // that every page is a duplicate of a host they cannot reach. Hence a loud warning at
    // the one moment someone is watching the log.
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[seo] NEXT_PUBLIC_SITE_URL is not set. Canonical URLs, hreflang, robots.txt and ' +
          'the sitemap will point at localhost. Set it (BUILD *and* RUNTIME) before deploying.'
      );
    }
    return 'http://localhost:3000';
  }

  return configured.replace(/\/+$/, '');
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * hreflang map for a path that exists in both locales.
 *
 * `x-default` points at Arabic: the platform is Jordan-first, so a user whose language
 * matches neither entry is better served by the market's own language than by English.
 */
export function localeAlternates(pathWithoutLocale: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  const suffix = pathWithoutLocale === '/' ? '' : pathWithoutLocale;
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = absoluteUrl(`/${locale}${suffix}`);
  languages['x-default'] = absoluteUrl(`/${defaultLocale}${suffix}`);
  return { canonical: '', languages };
}

/** Canonical + hreflang for one locale's rendering of a shared path. */
export function alternatesFor(locale: Locale, pathWithoutLocale: string) {
  const { languages } = localeAlternates(pathWithoutLocale);
  const suffix = pathWithoutLocale === '/' ? '' : pathWithoutLocale;
  return {
    canonical: absoluteUrl(`/${locale}${suffix}`),
    languages,
  };
}

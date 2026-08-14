import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { isValidLocale, getDictionary, locales, type Locale } from '@/lib/i18n/dictionaries';
import { UserNav } from '@/components/marketplace/user-nav';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld';
import { alternatesFor } from '@/lib/seo/site';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  if (!isValidLocale(params.locale)) return {};
  const dict = getDictionary(params.locale);
  return {
    // Every page under this segment inherits the locale's language and direction hints for
    // crawlers; individual pages add their own title/description and canonical.
    title: { default: dict.seo.siteName, template: `%s — ${dict.seo.siteName}` },
    description: dict.seo.siteDescription,
    alternates: alternatesFor(params.locale, '/'),
    openGraph: {
      siteName: dict.seo.siteName,
      locale: params.locale === 'ar' ? 'ar_JO' : 'en_US',
      type: 'website',
    },
  };
}

/**
 * True per-locale `<html lang dir>` would require moving the entire app (admin/tenant/
 * doctor dashboards too) under this segment — out of scope for Phase 5, which only adds
 * the patient-facing marketplace. This wrapper's `dir` attribute correctly drives RTL/LTR
 * layout and Tailwind's logical-property utilities for everything inside it; only the
 * outermost `<html>` tag (set in src/app/layout.tsx) stays fixed at `dir="rtl"`. See
 * ARCHITECTURE.md "i18n" for the full reasoning.
 *
 * This layout deliberately does **not** read the session. Doing so opts every page beneath
 * it into dynamic rendering — see `UserNav` for what that cost and why the session moved
 * client-side.
 */
export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isValidLocale(params.locale)) notFound();
  const locale: Locale = params.locale;
  const dict = getDictionary(locale);
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="min-h-screen bg-neutral-50">
      <JsonLd data={[organizationJsonLd(locale), webSiteJsonLd(locale)]} />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href={`/${locale}`} className="text-lg font-bold text-brand-700">
            DocBook
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href={`/${locale}/doctors`} className="text-neutral-700 hover:text-brand-700">
              {dict.nav.doctors}
            </Link>
            <Link href={`/${locale}/symptom-check`} className="text-neutral-700 hover:text-brand-700">
              {dict.symptomCheck.navLabel}
            </Link>
            <UserNav locale={locale} dict={dict} />
            <Link href={`/${otherLocale}`} className="text-neutral-400 hover:text-brand-700">
              {otherLocale === 'ar' ? 'العربية' : 'English'}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

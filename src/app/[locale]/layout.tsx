import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isValidLocale, getDictionary, locales, type Locale } from '@/lib/i18n/dictionaries';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * True per-locale `<html lang dir>` would require moving the entire app (admin/tenant/
 * doctor dashboards too) under this segment — out of scope for Phase 5, which only adds
 * the patient-facing marketplace. This wrapper's `dir` attribute correctly drives RTL/LTR
 * layout and Tailwind's logical-property utilities for everything inside it; only the
 * outermost `<html>` tag (set in src/app/layout.tsx) stays fixed at `dir="rtl"`. See
 * ARCHITECTURE.md "i18n" for the full reasoning.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isValidLocale(params.locale)) notFound();
  const locale: Locale = params.locale;
  const dict = getDictionary(locale);
  const session = await getServerSession(authOptions);
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="min-h-screen bg-neutral-50">
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
            {session?.user.role === 'PATIENT' ? (
              <>
                <Link href={`/${locale}/patient`} className="text-neutral-700 hover:text-brand-700">
                  {dict.nav.myAppointments}
                </Link>
                <Link href={`/${locale}/patient/records`} className="text-neutral-700 hover:text-brand-700">
                  {locale === 'ar' ? 'ملفي الصحي' : 'Health record'}
                </Link>
                <Link href={`/${locale}/patient/notifications`} className="text-neutral-700 hover:text-brand-700">
                  {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
                </Link>
              </>
            ) : (
              <>
                <Link href={`/${locale}/login`} className="text-neutral-700 hover:text-brand-700">
                  {dict.nav.login}
                </Link>
                <Link href={`/${locale}/register`} className="text-neutral-700 hover:text-brand-700">
                  {dict.nav.register}
                </Link>
              </>
            )}
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

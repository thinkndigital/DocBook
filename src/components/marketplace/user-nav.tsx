'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

/**
 * The session-dependent half of the marketplace nav.
 *
 * This exists as a client component for a rendering reason, not a styling one. The locale
 * layout used to call `getServerSession` to decide between these two link sets, and a
 * layout that reads the session opts *every page beneath it* into dynamic rendering. That
 * covered the entire public marketplace — the home page, the search page, and every doctor
 * profile — so the pages a crawler and a first-time visitor hit were rebuilt from the
 * database on each request, and none of them could be cached. Reading the session here
 * instead lets those pages be statically rendered and revalidated.
 *
 * The cost is that this half of the nav resolves after hydration. It is paid for with a
 * fixed-width placeholder rather than rendering nothing: collapsing and then re-expanding
 * the nav would shift the header on every first load, trading a server round-trip for a
 * Cumulative Layout Shift penalty on the exact pages this change was meant to speed up.
 */
export function UserNav({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { status, data } = useSession();

  const linkClass = 'text-neutral-700 hover:text-brand-700';

  if (status === 'loading') {
    // Reserves roughly the width the resolved links occupy, so the header does not jump.
    return <span aria-hidden className="inline-block h-4 w-32 rounded bg-neutral-100" />;
  }

  if (data?.user?.role === 'PATIENT') {
    return (
      <>
        <Link href={`/${locale}/patient`} className={linkClass}>
          {dict.nav.myAppointments}
        </Link>
        <Link href={`/${locale}/patient/records`} className={linkClass}>
          {locale === 'ar' ? 'ملفي الصحي' : 'Health record'}
        </Link>
        <Link href={`/${locale}/patient/notifications`} className={linkClass}>
          {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href={`/${locale}/login`} className={linkClass}>
        {dict.nav.login}
      </Link>
      <Link href={`/${locale}/register`} className={linkClass}>
        {dict.nav.register}
      </Link>
    </>
  );
}

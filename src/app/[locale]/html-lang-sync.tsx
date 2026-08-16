'use client';

import { useEffect } from 'react';
import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * Corrects `<html lang dir>` client-side for English pages.
 *
 * The root layout (`src/app/layout.tsx`, shared by every route including the always-Arabic
 * `/admin`, `/tenant`, `/doctor` portals) hardcodes `lang="ar" dir="rtl"` — a real per-locale
 * `<html>` would require nesting those Arabic-only portals under this `[locale]` segment too,
 * which is out of scope here. This component is the narrow fix: it corrects the two attributes
 * after mount for English pages specifically, without touching how any other route renders.
 * SSR/no-JS still serves `lang="ar" dir="rtl"` on first paint — a real gap for crawlers that
 * don't execute JS, but a strictly smaller one than shipping every English page mislabeled
 * for every real browser and screen reader.
 */
export function HtmlLangSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  return null;
}

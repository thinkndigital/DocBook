import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { siteUrl } from '@/lib/seo/site';

export const metadata: Metadata = {
  // Resolves every relative canonical, hreflang and OpenGraph URL the pages below declare.
  // Without it Next emits them relative, and a relative canonical is ignored by crawlers —
  // the tags would be present, look correct in the HTML, and do nothing.
  metadataBase: new URL(siteUrl()),
  title: 'DocBook — Healthcare Booking Platform',
  description: 'Find and book verified doctors, clinics, and hospitals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale-aware dir/lang switching lands in Phase 5 with next-intl; defaulting to the
  // Jordan-first Arabic/RTL baseline per CountryConfig until then.
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

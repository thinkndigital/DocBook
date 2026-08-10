import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
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

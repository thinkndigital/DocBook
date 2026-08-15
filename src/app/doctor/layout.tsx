import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';

import type { Metadata } from 'next';

/**
 * Staff portal: never indexed. See src/app/robots.ts for why both layers exist.
 */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/doctor');
  if (session.user.role !== 'DOCTOR') redirect('/');

  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="flex gap-4 overflow-x-auto border-b border-neutral-200 bg-white px-4 py-3 text-sm md:px-8">
        <Link href="/doctor" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          الملف الشخصي
        </Link>
        <Link href="/doctor/appointments" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          مواعيد اليوم
        </Link>
        <Link href="/doctor/patients" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          مرضاي
        </Link>
        <Link href="/doctor/calendar" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          مزامنة التقويم
        </Link>
        <Link href="/doctor/analytics" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          أدائي
        </Link>
        <Link href="/doctor/equipment" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          تجهيزات طبية
        </Link>
        <Link href="/doctor/equipment/orders" className="whitespace-nowrap text-neutral-700 hover:text-brand-700">
          طلباتي
        </Link>
      </nav>
      <div className="p-4 md:p-8">{children}</div>
    </div>
  );
}

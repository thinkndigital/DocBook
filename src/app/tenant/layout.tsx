import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';

import type { Metadata } from 'next';

/**
 * Staff portal: never indexed. See src/app/robots.ts for why both layers exist.
 */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

const NAV = [
  { href: '/tenant', label: 'نظرة عامة' },
  { href: '/tenant/appointments', label: 'المواعيد والطابور' },
  { href: '/tenant/branches', label: 'الفروع' },
  { href: '/tenant/doctors', label: 'الأطباء' },
  { href: '/tenant/staff', label: 'الموظفون' },
  { href: '/tenant/services', label: 'الخدمات' },
  { href: '/tenant/billing', label: 'الفوترة والاشتراك' },
  { href: '/tenant/analytics', label: 'التحليلات' },
  { href: '/tenant/insights', label: 'رؤى تشغيلية' },
];

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/tenant');
  if (session.user.role !== 'TENANT_ADMIN') redirect('/');

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-l border-neutral-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-bold text-brand-700">لوحة إدارة الجهة</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-neutral-200 px-2 pt-4 text-xs text-neutral-500">
          {session.user.name} · {session.user.email}
        </div>
      </aside>
      <main className="flex-1 bg-neutral-50 p-8">{children}</main>
    </div>
  );
}

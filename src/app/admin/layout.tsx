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
  { href: '/admin', label: 'نظرة عامة' },
  { href: '/admin/analytics', label: 'التحليلات' },
  { href: '/admin/tenants', label: 'الجهات الصحية' },
  { href: '/admin/doctors', label: 'توثيق الأطباء' },
  { href: '/admin/representatives', label: 'المندوبون' },
  { href: '/admin/partner-applications', label: 'طلبات الانضمام' },
  { href: '/admin/settings/countries', label: 'الدول والمدن' },
  { href: '/admin/settings/plans', label: 'خطط الاشتراك' },
  { href: '/admin/commission-rules', label: 'قواعد العمولات' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/admin');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-neutral-200 bg-white p-3 md:w-64 md:border-b-0 md:border-l md:p-4">
        <div className="mb-3 px-2 text-lg font-bold text-brand-700 md:mb-6">DocBook Admin</div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 hidden border-t border-neutral-200 px-2 pt-4 text-xs text-neutral-500 md:mt-8 md:block">
          {session.user.name} · {session.user.email}
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-neutral-50 p-4 md:p-8">{children}</main>
    </div>
  );
}

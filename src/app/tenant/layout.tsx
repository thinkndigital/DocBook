import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { LogoutButton } from '@/components/auth/logout-button';

import type { Metadata } from 'next';

/**
 * Staff portal: never indexed. See src/app/robots.ts for why both layers exist.
 */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

const TENANT_ADMIN_ONLY_NAV = [
  { href: '/tenant', label: 'نظرة عامة' },
  { href: '/tenant/appointments', label: 'المواعيد والطابور' },
  { href: '/tenant/branches', label: 'الفروع' },
  { href: '/tenant/doctors', label: 'الأطباء' },
  { href: '/tenant/staff', label: 'الموظفون' },
  { href: '/tenant/services', label: 'الخدمات' },
  { href: '/tenant/billing', label: 'الفوترة والاشتراك' },
  { href: '/tenant/reviews', label: 'التقييمات' },
  { href: '/tenant/analytics', label: 'التحليلات' },
  { href: '/tenant/insights', label: 'رؤى تشغيلية' },
];

/**
 * A receptionist has `queue:manage`/`appointment:create_for_patient`/`patient:register`/
 * `ai:clinic_insights` — real permissions the API already accepts (see
 * `/api/v1/tenant/appointments`) — but until now the layout below turned every RECEPTIONIST
 * session away at the door before any of that mattered: `if (role !== 'TENANT_ADMIN')
 * redirect('/')`. Nothing else changed to make room for this; the pages a receptionist must
 * not reach (branches/doctors/staff/services/billing/analytics) call their service
 * functions with no permission check of their own — see `requireTenantAdminPage` — so
 * broadening this without adding those guards would have leaked billing/staff data instead.
 */
const RECEPTIONIST_NAV = [
  { href: '/tenant/appointments', label: 'المواعيد والطابور' },
  { href: '/tenant/insights', label: 'رؤى تشغيلية' },
];

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/tenant');
  if (session.user.role !== 'TENANT_ADMIN' && session.user.role !== 'RECEPTIONIST') redirect('/');

  const NAV = session.user.role === 'TENANT_ADMIN' ? TENANT_ADMIN_ONLY_NAV : RECEPTIONIST_NAV;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-neutral-200 bg-white p-3 md:w-64 md:border-b-0 md:border-l md:p-4">
        <div className="mb-3 px-2 text-lg font-bold text-brand-700 md:mb-6">لوحة إدارة الجهة</div>
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
          <Link
            href="/account/password"
            className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            حسابي
          </Link>
          <LogoutButton className="whitespace-nowrap rounded-md px-3 py-2 text-right text-sm text-neutral-700 hover:bg-neutral-100" />
        </nav>
        <div className="mt-4 border-t border-neutral-200 px-2 pt-4 text-xs text-neutral-500">
          {session.user.name} · {session.user.email}
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-neutral-50 p-4 md:p-8">{children}</main>
    </div>
  );
}

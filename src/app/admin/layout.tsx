import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';

const NAV = [
  { href: '/admin', label: 'نظرة عامة' },
  { href: '/admin/tenants', label: 'الجهات الصحية' },
  { href: '/admin/settings/countries', label: 'الدول والمدن' },
  { href: '/admin/settings/plans', label: 'خطط الاشتراك' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/admin');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/');

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-l border-neutral-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-bold text-brand-700">DocBook Admin</div>
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

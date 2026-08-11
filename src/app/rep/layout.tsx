import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';

const NAV = [
  { href: '/rep', label: 'لوحة الأداء' },
  { href: '/rep/book', label: 'حجز موعد' },
  { href: '/rep/bookings', label: 'حجوزاتي' },
  { href: '/rep/commissions', label: 'عمولاتي' },
];

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/rep');
  if (session.user.role !== 'REPRESENTATIVE') redirect('/');

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-l border-neutral-200 bg-white p-4">
        <div className="mb-6 px-2 text-lg font-bold text-brand-700">بوابة المندوب</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
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

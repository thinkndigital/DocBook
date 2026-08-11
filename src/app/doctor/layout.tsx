import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/doctor');
  if (session.user.role !== 'DOCTOR') redirect('/');

  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="flex gap-4 border-b border-neutral-200 bg-white px-8 py-3 text-sm">
        <Link href="/doctor" className="text-neutral-700 hover:text-brand-700">
          الملف الشخصي
        </Link>
        <Link href="/doctor/appointments" className="text-neutral-700 hover:text-brand-700">
          مواعيد اليوم
        </Link>
        <Link href="/doctor/patients" className="text-neutral-700 hover:text-brand-700">
          مرضاي
        </Link>
        <Link href="/doctor/calendar" className="text-neutral-700 hover:text-brand-700">
          مزامنة التقويم
        </Link>
      </nav>
      <div className="p-8">{children}</div>
    </div>
  );
}

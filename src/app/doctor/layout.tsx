import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect('/login?callbackUrl=/doctor');
  if (session.user.role !== 'DOCTOR') redirect('/');

  return <div className="min-h-screen bg-neutral-50 p-8">{children}</div>;
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/api/session';
import { PasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function ChangePasswordPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?callbackUrl=/account/password');

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <PasswordForm required={session.mustChangePassword} />
    </div>
  );
}

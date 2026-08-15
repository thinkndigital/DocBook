'use client';

import { signOut } from 'next-auth/react';

export function LogoutButton({
  callbackUrl = '/login',
  label = 'تسجيل الخروج',
  className,
}: {
  callbackUrl?: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl })}
      className={className ?? 'whitespace-nowrap text-neutral-700 hover:text-red-600'}
    >
      {label}
    </button>
  );
}

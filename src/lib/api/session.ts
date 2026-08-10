import { getServerSession } from 'next-auth';
import type { NextRequest } from 'next/server';
import { authOptions, type SessionUser } from '@/lib/auth';

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** IP/user-agent for audit logging — Next.js strips remote address from NextRequest, so read forwarded headers. */
export function getRequestMeta(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  const ipAddress = forwarded ? forwarded.split(',')[0]?.trim() ?? null : null;
  const userAgent = req.headers.get('user-agent');
  return { ipAddress, userAgent };
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { ensureTenantInviteCode, regenerateTenantInviteCode } from '@/lib/services/tenants';

export const dynamic = 'force-dynamic';

/** TENANT_ADMIN reading their own clinic's invite code, backfilling it if this tenant predates the field. */
export async function GET() {
  const session = await getServerSession(authOptions);
  return withTenantAuthorization(session?.user, 'tenant:manage_own', async (user) => {
    const code = await ensureTenantInviteCode(user.tenantId);
    return NextResponse.json({ data: { inviteCode: code } });
  });
}

/** Rotates the code — the old one stops working immediately. */
export async function POST() {
  const session = await getServerSession(authOptions);
  return withTenantAuthorization(session?.user, 'tenant:manage_own', async (user) => {
    const code = await regenerateTenantInviteCode(user.tenantId, user);
    return NextResponse.json({ data: { inviteCode: code } });
  });
}

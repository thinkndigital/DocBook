import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, type SessionUser } from '@/lib/auth';
import type { Permission } from '@/types/rbac';
import { withAuthorization } from '@/lib/rbac';
import { runWithTenant } from '@/lib/tenant';

/**
 * Combines RBAC with tenant scoping: authorizes the permission, then runs the handler
 * inside `runWithTenant` so every Prisma query it issues is auto-scoped to the caller's
 * tenant by the middleware registered in db.ts — this is the first place that middleware
 * actually gets exercised (Phase 1/2 routes didn't need it; SUPER_ADMIN operates
 * cross-tenant by design). See ARCHITECTURE.md "Multi-tenancy."
 */
export async function withTenantAuthorization<T>(
  session: SessionUser | null | undefined,
  permission: Permission,
  handler: (user: SessionUser & { tenantId: string }) => Promise<T>
): Promise<T | NextResponse> {
  return withAuthorization(session, permission, async (user) => {
    if (!user.tenantId) {
      return NextResponse.json(
        { error: { code: 'NO_TENANT_CONTEXT', message: 'This account is not attached to a tenant.' } },
        { status: 403 }
      );
    }
    const tenantId = user.tenantId;
    return runWithTenant({ tenantId, bypass: false }, () => handler({ ...user, tenantId }));
  });
}

/**
 * Server-component page equivalent of withTenantAuthorization — the /tenant/* layout
 * already redirects non-TENANT_ADMIN sessions, so this just fetches the session and runs
 * `fn` inside the caller's tenant context. Assumes the route is already guarded.
 */
export async function runInSessionTenant<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getServerSession(authOptions);
  if (!session?.user.tenantId) {
    throw new Error('runInSessionTenant called without a tenant-scoped session — is the page guarded?');
  }
  return runWithTenant({ tenantId: session.user.tenantId, bypass: false }, fn);
}

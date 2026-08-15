import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions, type SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/types/rbac';
import { withAuthorization } from '@/lib/rbac';
import { recordAudit } from '@/lib/audit';
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
 * Same as withTenantAuthorization but grants access if the caller holds ANY of the given
 * permissions — several appointment/queue actions are legitimately available to
 * RECEPTIONIST, TENANT_ADMIN, and DOCTOR under three different existing permission names
 * (see src/types/rbac.ts) rather than one shared one, and this avoids either re-litigating
 * the Phase 1 permission list or duplicating the same route three times.
 */
export async function withTenantAuthorizationAny<T>(
  session: SessionUser | null | undefined,
  permissions: Permission[],
  handler: (user: SessionUser & { tenantId: string }) => Promise<T>
): Promise<T | NextResponse> {
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authorized for this action.' } },
      { status: 401 }
    );
  }
  const granted = permissions.some((p) => hasPermission(session.role, p));
  if (!granted) {
    await recordAudit({
      actorUserId: session.id,
      tenantId: session.tenantId,
      action: 'PERMISSION_DENIED',
      entityType: 'Permission',
      entityId: permissions.join('|'),
    });
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Not authorized for this action.' } },
      { status: 403 }
    );
  }
  if (!session.tenantId) {
    return NextResponse.json(
      { error: { code: 'NO_TENANT_CONTEXT', message: 'This account is not attached to a tenant.' } },
      { status: 403 }
    );
  }
  const tenantId = session.tenantId;
  return runWithTenant({ tenantId, bypass: false }, () => handler({ ...session, tenantId }));
}

/**
 * Server-component page equivalent of withTenantAuthorization — the /tenant/* layout
 * already redirects sessions with no tenant role at all (neither TENANT_ADMIN nor
 * RECEPTIONIST), so this just fetches the session and runs `fn` inside the caller's tenant
 * context. Assumes the route is already guarded — but the layout only proves "some tenant
 * staff role", not which one, so a page restricted to TENANT_ADMIN specifically (billing,
 * staff, branches, doctors, services, analytics — see `requireTenantAdminPage`) must not
 * rely on this alone.
 */
export async function runInSessionTenant<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getServerSession(authOptions);
  if (!session?.user.tenantId) {
    throw new Error('runInSessionTenant called without a tenant-scoped session — is the page guarded?');
  }
  return runWithTenant({ tenantId: session.user.tenantId, bypass: false }, fn);
}

/**
 * Page-level guard for the `/tenant/*` pages that only TENANT_ADMIN may see —
 * RECEPTIONIST shares the `/tenant` layout (they need `/tenant/appointments` and
 * `/tenant/insights`, whose APIs already accept `queue:manage`/`ai:clinic_insights`) but
 * has none of `branch:manage`/`doctor:manage`/`staff:manage`/`service:manage`/
 * `billing:manage_tenant`/`analytics:read_tenant`. Those pages call their service
 * functions with no permission check of their own (`runInSessionTenant` only proves tenant
 * *membership*, not which tenant role) — this must run first on each of them, or a
 * receptionist who types the URL sees the clinic's staff list, billing history, and
 * subscription plan.
 */
export async function requireTenantAdminPage() {
  const session = await getServerSession(authOptions);
  if (session?.user.role !== 'TENANT_ADMIN') {
    redirect('/tenant/appointments');
  }
  return session;
}

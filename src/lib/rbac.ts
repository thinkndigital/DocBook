import { NextResponse } from 'next/server';
import type { SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/types/rbac';
import { recordAudit } from '@/lib/audit';

export class AuthorizationError extends Error {}

/**
 * Every API route calls this before touching data. Throws rather than returning a
 * boolean so a route can't accidentally ignore the result — see SECURITY.md.
 */
export function authorize(session: SessionUser | null | undefined, permission: Permission): SessionUser {
  if (!session) throw new AuthorizationError('UNAUTHENTICATED');
  if (!hasPermission(session.role, permission)) throw new AuthorizationError('FORBIDDEN');
  return session;
}

/**
 * Wraps a route handler body: converts AuthorizationError into the standard error
 * envelope (see API.md) and audits sensitive-permission denials.
 */
export async function withAuthorization<T>(
  session: SessionUser | null | undefined,
  permission: Permission,
  handler: (user: SessionUser) => Promise<T>
): Promise<T | NextResponse> {
  try {
    const user = authorize(session, permission);
    return await handler(user);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      if (SENSITIVE_PERMISSIONS.has(permission)) {
        await recordAudit({
          actorUserId: session?.id ?? null,
          tenantId: session?.tenantId ?? null,
          action: err.message === 'UNAUTHENTICATED' ? 'AUTH_REQUIRED' : 'PERMISSION_DENIED',
          entityType: 'Permission',
          entityId: permission,
        });
      }
      const status = err.message === 'UNAUTHENTICATED' ? 401 : 403;
      return NextResponse.json(
        { error: { code: err.message, message: 'Not authorized for this action.' } },
        { status }
      );
    }
    throw err;
  }
}

const SENSITIVE_PERMISSIONS = new Set<Permission>([
  'medical_record:read_own',
  'medical_record:read_assigned',
  'medical_record:create',
  'prescription:read_own',
  'prescription:create',
  'payment:create_own',
  'billing:manage_tenant',
  'audit_log:read',
  'system_setting:manage',
]);

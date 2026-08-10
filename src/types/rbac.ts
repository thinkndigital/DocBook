import type { UserRole } from '@prisma/client';

/**
 * Flat permission strings, `resource:action` shaped. Kept as a static list rather than a
 * DB table for Phase 1 — see DATABASE.md's "permissions are code, not rows" note.
 */
export type Permission =
  // Patient
  | 'account:manage_own'
  | 'family_member:manage_own'
  | 'doctor:search'
  | 'clinic:search'
  | 'appointment:create'
  | 'appointment:read_own'
  | 'appointment:reschedule_own'
  | 'appointment:cancel_own'
  | 'payment:create_own'
  | 'medical_record:read_own'
  | 'prescription:read_own'
  | 'review:create_own'
  | 'notification:read_own'
  | 'video_session:join_own'
  | 'queue:read_own'
  // Doctor
  | 'doctor_profile:update_own'
  | 'schedule:manage_own'
  | 'appointment:update_status'
  | 'patient:read_assigned'
  | 'medical_record:create'
  | 'medical_record:read_assigned'
  | 'prescription:create'
  | 'earnings:read_own'
  | 'analytics:read_own'
  // Tenant admin (clinic/hospital manager)
  | 'tenant:manage_own'
  | 'branch:manage'
  | 'doctor:manage'
  | 'staff:manage'
  | 'service:manage'
  | 'appointment:manage_tenant'
  | 'queue:manage'
  | 'report:read_tenant'
  | 'analytics:read_tenant'
  | 'billing:manage_tenant'
  // Receptionist
  | 'appointment:create_for_patient'
  | 'appointment:checkin'
  | 'patient:register'
  | 'payment:collect'
  // Representative — deliberately excludes medical_record:* and prescription:*
  | 'representative_account:manage_assigned'
  | 'appointment:create_on_behalf'
  | 'commission:read_own'
  | 'lead:manage_own'
  | 'performance:read_own'
  // Super admin
  | 'tenant:manage_all'
  | 'tenant:verify'
  | 'subscription_plan:manage'
  | 'commission_rule:manage'
  | 'cms:manage'
  | 'audit_log:read'
  | 'system_setting:manage';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | '*'> = {
  SUPER_ADMIN: '*',
  PATIENT: [
    'account:manage_own',
    'family_member:manage_own',
    'doctor:search',
    'clinic:search',
    'appointment:create',
    'appointment:read_own',
    'appointment:reschedule_own',
    'appointment:cancel_own',
    'payment:create_own',
    'medical_record:read_own',
    'prescription:read_own',
    'review:create_own',
    'notification:read_own',
    'video_session:join_own',
    'queue:read_own',
  ],
  DOCTOR: [
    'doctor_profile:update_own',
    'schedule:manage_own',
    'appointment:read_own',
    'appointment:update_status',
    'patient:read_assigned',
    'medical_record:create',
    'medical_record:read_assigned',
    'prescription:create',
    'earnings:read_own',
    'analytics:read_own',
    'video_session:join_own',
    'queue:read_own',
    'notification:read_own',
  ],
  TENANT_ADMIN: [
    'tenant:manage_own',
    'branch:manage',
    'doctor:manage',
    'staff:manage',
    'service:manage',
    'appointment:manage_tenant',
    'queue:manage',
    'report:read_tenant',
    'analytics:read_tenant',
    'billing:manage_tenant',
    'notification:read_own',
  ],
  RECEPTIONIST: [
    'appointment:create_for_patient',
    'appointment:reschedule_own',
    'appointment:cancel_own',
    'appointment:checkin',
    'queue:manage',
    'patient:register',
    'payment:collect',
    'notification:read_own',
  ],
  REPRESENTATIVE: [
    'representative_account:manage_assigned',
    'doctor:search',
    'clinic:search',
    'appointment:create_on_behalf',
    'appointment:reschedule_own',
    'appointment:cancel_own',
    'commission:read_own',
    'lead:manage_own',
    'performance:read_own',
    'notification:read_own',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (granted === '*') return true;
  return granted.includes(permission);
}

import { db } from '@/lib/db';

interface RecordAuditInput {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}

/**
 * Append-only by construction: no update/delete path is exposed for AuditLog anywhere
 * in the codebase. Never pass medical record *content* here — only that an access or
 * change occurred (see SECURITY.md).
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      beforeState: input.beforeState === undefined ? undefined : (input.beforeState as object),
      afterState: input.afterState === undefined ? undefined : (input.afterState as object),
    },
  });
}

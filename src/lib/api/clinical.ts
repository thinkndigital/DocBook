import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/respond';
import { ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { ClinicalAccessDeniedError, resolveClinicalActor, type ClinicalActor } from '@/lib/services/clinical-access';
import { MedicalRecordNotFoundError } from '@/lib/services/medical-records';
import { PrescriptionNotFoundError, InvalidAppointmentError } from '@/lib/services/prescriptions';
import { InvalidFileError, AttachmentNotFoundError } from '@/lib/services/attachments';
import type { SessionUser } from '@/lib/auth';
import type { Permission } from '@/types/rbac';
import { hasPermission } from '@/types/rbac';
import { recordAudit } from '@/lib/audit';

/**
 * Wrapper for every clinical route: checks the permission, resolves the actor to a
 * doctor/patient identity, and maps the clinical error types onto the standard envelope.
 * A denial here is always audited — an attempt to reach someone else's medical record is
 * exactly the event a security review needs to see.
 */
export async function withClinicalAuthorization<T>(
  session: SessionUser | null | undefined,
  permission: Permission,
  handler: (actor: ClinicalActor) => Promise<T>
): Promise<T | NextResponse> {
  if (!session) {
    return errorResponse('UNAUTHENTICATED', 'Not authorized for this action.', 401);
  }
  if (!hasPermission(session.role, permission)) {
    await recordAudit({
      actorUserId: session.id,
      tenantId: session.tenantId,
      action: 'CLINICAL_ACCESS_DENIED',
      entityType: 'Permission',
      entityId: permission,
    });
    return errorResponse('FORBIDDEN', 'Not authorized for this action.', 403);
  }

  try {
    const actor = await resolveClinicalActor(session);
    return await handler(actor);
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    if (err instanceof ClinicalAccessDeniedError) {
      await recordAudit({
        actorUserId: session.id,
        tenantId: session.tenantId,
        action: 'CLINICAL_ACCESS_DENIED',
        entityType: 'MedicalRecord',
        entityId: null,
      });
      return errorResponse('FORBIDDEN', err.message, 403);
    }
    if (err instanceof MedicalRecordNotFoundError) return errorResponse('RECORD_NOT_FOUND', err.message, 404);
    if (err instanceof PrescriptionNotFoundError) return errorResponse('PRESCRIPTION_NOT_FOUND', err.message, 404);
    if (err instanceof AttachmentNotFoundError) return errorResponse('ATTACHMENT_NOT_FOUND', err.message, 404);
    if (err instanceof InvalidAppointmentError) return errorResponse('INVALID_APPOINTMENT', err.message, 400);
    if (err instanceof InvalidFileError) return errorResponse('INVALID_FILE', err.message, 400);
    throw err;
  }
}

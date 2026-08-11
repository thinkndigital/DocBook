import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';

export class ClinicalAccessDeniedError extends Error {}

export interface ClinicalActor {
  session: SessionUser;
  /** Resolved doctor id when the actor is a DOCTOR. */
  doctorId?: string;
  /** Resolved patient id when the actor is a PATIENT. */
  patientId?: string;
}

/**
 * The single gate for every clinical read/write. Deliberately centralised: the brief (§12)
 * requires doctors reach records "only with appropriate permissions", and scattering that
 * rule across routes is how it eventually gets forgotten in one of them.
 *
 * Rules:
 *  - PATIENT: only their own records.
 *  - DOCTOR: only patients they have a treatment relationship with — i.e. at least one
 *    appointment between that doctor and that patient. A doctor at the same clinic who has
 *    never seen the patient gets nothing; "works here" is not a clinical relationship.
 *  - REPRESENTATIVE: never. This is already structurally impossible (the role's permission
 *    list contains no `medical_record` or `prescription` entries at all, so
 *    withAuthorization rejects it before reaching here) — the fall-through below is
 *    defence in depth, not the primary control.
 *  - TENANT_ADMIN / RECEPTIONIST: never. Running a clinic is an administrative role;
 *    front-desk staff have no business reading diagnoses.
 *  - SUPER_ADMIN: never, by design. Platform operators can see that an access occurred
 *    (audit logs) but not the clinical content itself.
 */
export async function resolveClinicalActor(session: SessionUser): Promise<ClinicalActor> {
  if (session.role === 'DOCTOR') {
    const doctor = await db.doctor.findUnique({ where: { userId: session.id } });
    if (!doctor) throw new ClinicalAccessDeniedError('No doctor profile for this account.');
    return { session, doctorId: doctor.id };
  }
  if (session.role === 'PATIENT') {
    const patient = await db.patient.findUnique({ where: { userId: session.id } });
    if (!patient) throw new ClinicalAccessDeniedError('No patient profile for this account.');
    return { session, patientId: patient.id };
  }
  throw new ClinicalAccessDeniedError('This role may not access clinical records.');
}

/** True when the doctor has any appointment with this patient (past or upcoming). */
export async function doctorTreatsPatient(doctorId: string, patientId: string): Promise<boolean> {
  const count = await db.appointment.count({ where: { doctorId, patientId } });
  return count > 0;
}

export async function assertCanAccessPatientRecords(actor: ClinicalActor, patientId: string): Promise<void> {
  if (actor.patientId) {
    if (actor.patientId !== patientId) {
      throw new ClinicalAccessDeniedError('These records do not belong to you.');
    }
    return;
  }
  if (actor.doctorId) {
    if (!(await doctorTreatsPatient(actor.doctorId, patientId))) {
      throw new ClinicalAccessDeniedError('You do not have a treatment relationship with this patient.');
    }
    return;
  }
  throw new ClinicalAccessDeniedError('This role may not access clinical records.');
}

/**
 * Records THAT an access happened — never WHAT was read. Per SECURITY.md and brief §40,
 * medical content must never be copied into the audit log, or the audit trail becomes a
 * second, less-protected copy of the record.
 */
export async function auditClinicalAccess(
  actor: ClinicalActor,
  action: string,
  entityType: string,
  entityId: string | null,
  meta?: { tenantId?: string | null; patientId?: string; ipAddress?: string | null; userAgent?: string | null }
) {
  await recordAudit({
    actorUserId: actor.session.id,
    tenantId: meta?.tenantId ?? actor.session.tenantId ?? null,
    action,
    entityType,
    entityId,
    ipAddress: meta?.ipAddress ?? null,
    userAgent: meta?.userAgent ?? null,
    // Identifiers only. No diagnosis, notes, medication names, or file contents.
    afterState: meta?.patientId ? { patientId: meta.patientId } : undefined,
  });
}

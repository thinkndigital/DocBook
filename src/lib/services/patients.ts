import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import bcrypt from 'bcryptjs';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { registerPatientSchema, selfRegisterPatientSchema } from '@/lib/validation/patient';
import { normalizeEmail } from '@/lib/validation/common';

type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
type SelfRegisterPatientInput = z.infer<typeof selfRegisterPatientSchema>;

export class PatientConflictError extends Error {}

/**
 * Patients are not tenant-scoped (see prisma/schema.prisma) — one patient identity can
 * book at any clinic on the platform, matching how a real person has one medical
 * identity, not one per clinic they've visited.
 */
export async function findPatientByEmail(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    include: { patient: true },
  });
  if (!user || user.role !== 'PATIENT' || !user.patient) return null;
  return { ...user.patient, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } };
}

async function createPatientRow(
  input: { email: string; name: string; phone?: string; gender?: 'MALE' | 'FEMALE'; dateOfBirth?: string },
  passwordHash: string
) {
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new PatientConflictError(`A user with email ${email} already exists.`);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone: input.phone,
        passwordHash,
        role: 'PATIENT',
        name: input.name,
        status: 'ACTIVE',
      },
    });

    return tx.patient.create({
      data: {
        userId: user.id,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
  });
}

/**
 * Staff or representative registering a patient on someone's behalf — default assigned
 * password. Audited against the acting tenant when the actor has one (receptionist/tenant
 * admin); a representative has no tenantId, so the caller passes the tenant being booked
 * at via `auditTenantId` instead.
 */
export async function registerPatient(input: RegisterPatientInput, actor: SessionUser, auditTenantId?: string) {
  const passwordHash = await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12);
  const patient = await createPatientRow(input, passwordHash);

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId ?? auditTenantId ?? null,
    action: 'PATIENT_REGISTERED',
    entityType: 'Patient',
    entityId: patient.id,
  });

  return patient;
}

/** Public self-service signup — the patient chooses their own password and there is no acting staff user. */
export async function selfRegisterPatient(input: SelfRegisterPatientInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const patient = await createPatientRow(input, passwordHash);

  await recordAudit({
    actorUserId: patient.user.id,
    action: 'PATIENT_SELF_REGISTERED',
    entityType: 'Patient',
    entityId: patient.id,
  });

  return patient;
}

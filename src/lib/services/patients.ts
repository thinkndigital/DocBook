import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import bcrypt from 'bcryptjs';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { registerPatientSchema } from '@/lib/validation/patient';

type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

export class PatientConflictError extends Error {}

/**
 * Patients are not tenant-scoped (see prisma/schema.prisma) — one patient identity can
 * book at any clinic on the platform, matching how a real person has one medical
 * identity, not one per clinic they've visited. `actor.tenantId` is recorded on the audit
 * log only (which clinic's staff did the registering), not on the Patient/User rows.
 */
export async function findPatientByEmail(email: string) {
  const user = await db.user.findUnique({
    where: { email },
    include: { patient: true },
  });
  if (!user || user.role !== 'PATIENT' || !user.patient) return null;
  return { ...user.patient, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } };
}

export async function registerPatient(input: RegisterPatientInput, actor: SessionUser & { tenantId: string }) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new PatientConflictError(`A user with email ${input.email} already exists.`);

  const passwordHash = await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12);

  const patient = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
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

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'PATIENT_REGISTERED',
    entityType: 'Patient',
    entityId: patient.id,
  });

  return patient;
}

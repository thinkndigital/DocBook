import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import bcrypt from 'bcryptjs';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createDoctorSchema, updateDoctorSchema } from '@/lib/validation/tenant';
import type { verifyDoctorSchema } from '@/lib/validation/doctor';
import { normalizeEmail } from '@/lib/validation/common';

type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;

export class DoctorConflictError extends Error {}
export class InvalidBranchError extends Error {}

const DOCTOR_INCLUDE = {
  user: { select: { id: true, name: true, email: true, status: true } },
  specialty: true,
  branches: { include: { branch: { select: { id: true, name: true } } } },
} as const;

// ---------- Tenant-scoped (run inside runWithTenant) ----------

export async function listDoctors() {
  return db.doctor.findMany({ include: DOCTOR_INCLUDE, orderBy: { createdAt: 'desc' } });
}

export async function getDoctor(id: string) {
  return db.doctor.findFirst({ where: { id }, include: DOCTOR_INCLUDE });
}

export async function createDoctor(input: CreateDoctorInput, actor: SessionUser & { tenantId: string }) {
  const email = normalizeEmail(input.email);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) throw new DoctorConflictError(`A user with email ${email} already exists.`);

  // Branches are tenant-scoped, so this findMany (running inside the caller's tenant
  // context) can only ever return branches that belong to this tenant — if a caller
  // passes another tenant's branch id, it simply won't show up here.
  const branches = await db.branch.findMany({ where: { id: { in: input.branchIds } } });
  if (branches.length !== input.branchIds.length) {
    throw new InvalidBranchError('One or more branches do not exist or do not belong to this tenant.');
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12);

  const doctor = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: actor.tenantId,
        email,
        passwordHash,
        role: 'DOCTOR',
        name: input.name,
        nameAr: input.nameAr,
        status: 'ACTIVE',
        // Created on the shared assigned password; blocked from everything until changed.
        mustChangePassword: true,
      },
    });

    const created = await tx.doctor.create({
      data: {
        userId: user.id,
        tenantId: actor.tenantId,
        specialtyId: input.specialtyId,
        licenseNumber: input.licenseNumber,
        yearsExperience: input.yearsExperience,
        gender: input.gender,
        languages: input.languages,
        consultationPriceMinor: input.consultationPriceMinor,
        bio: input.bio,
        bioAr: input.bioAr,
        branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
      },
      include: DOCTOR_INCLUDE,
    });

    return created;
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'DOCTOR_CREATED',
    entityType: 'Doctor',
    entityId: doctor.id,
    afterState: { specialtyId: doctor.specialtyId, licenseNumber: doctor.licenseNumber },
  });

  return doctor;
}

export async function updateDoctor(id: string, input: UpdateDoctorInput, actor: SessionUser & { tenantId: string }) {
  const before = await getDoctor(id);
  if (!before) return null;

  if (input.branchIds) {
    const branches = await db.branch.findMany({ where: { id: { in: input.branchIds } } });
    if (branches.length !== input.branchIds.length) {
      throw new InvalidBranchError('One or more branches do not exist or do not belong to this tenant.');
    }
  }

  const { branchIds, ...fields } = input;

  const doctor = await db.$transaction(async (tx) => {
    if (branchIds) {
      await tx.doctorBranch.deleteMany({ where: { doctorId: id } });
      await tx.doctorBranch.createMany({ data: branchIds.map((branchId) => ({ doctorId: id, branchId })) });
    }
    return tx.doctor.update({ where: { id }, data: fields, include: DOCTOR_INCLUDE });
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'DOCTOR_UPDATED',
    entityType: 'Doctor',
    entityId: id,
    beforeState: { consultationPriceMinor: before.consultationPriceMinor },
    afterState: { consultationPriceMinor: doctor.consultationPriceMinor },
  });

  return doctor;
}

// ---------- Own-profile self-service (scoped by userId, no tenant context needed) ----------

export async function getOwnDoctorProfile(userId: string) {
  return db.doctor.findUnique({ where: { userId }, include: DOCTOR_INCLUDE });
}

export async function updateOwnDoctorProfile(
  userId: string,
  input: { bio?: string; bioAr?: string; languages?: string[]; consultationPriceMinor?: number },
  actor: SessionUser
) {
  const doctor = await db.doctor.findUnique({ where: { userId } });
  if (!doctor) return null;
  const updated = await db.doctor.update({ where: { userId }, data: input, include: DOCTOR_INCLUDE });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: doctor.tenantId,
    action: 'DOCTOR_PROFILE_SELF_UPDATED',
    entityType: 'Doctor',
    entityId: doctor.id,
  });
  return updated;
}

// ---------- Admin (SUPER_ADMIN), cross-tenant, no tenant scoping ----------

export async function listPendingDoctors() {
  return db.doctor.findMany({
    where: { verificationStatus: 'PENDING' },
    include: { ...DOCTOR_INCLUDE, tenant: { select: { id: true, name: true, nameAr: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function verifyDoctor(id: string, input: VerifyDoctorInput, actor: SessionUser) {
  const before = await db.doctor.findUnique({ where: { id } });
  if (!before) return null;

  const doctor = await db.doctor.update({
    where: { id },
    data: {
      verificationStatus: input.verificationStatus,
      verified: input.verificationStatus === 'VERIFIED',
    },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: doctor.tenantId,
    action: `DOCTOR_${input.verificationStatus}`,
    entityType: 'Doctor',
    entityId: id,
    beforeState: { verificationStatus: before.verificationStatus },
    afterState: { verificationStatus: doctor.verificationStatus },
  });

  return doctor;
}

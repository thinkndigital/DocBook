import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { resolveInitialPassword } from '@/lib/services/account-provisioning';
import { adminSetUserPassword } from '@/lib/services/password';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createDoctorSchema, updateDoctorSchema } from '@/lib/validation/tenant';
import type { verifyDoctorSchema } from '@/lib/validation/doctor';
import type { selfRegisterDoctorSchema } from '@/lib/validation/self-register';
import { normalizeEmail } from '@/lib/validation/common';
import { findTenantByInviteCode } from '@/lib/services/tenants';
import bcrypt from 'bcryptjs';

type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;
type SelfRegisterDoctorInput = z.infer<typeof selfRegisterDoctorSchema>;

export class DoctorConflictError extends Error {}
export class InvalidBranchError extends Error {}
export class InvalidInviteCodeError extends Error {}

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

  const { passwordHash, mustChangePassword } = await resolveInitialPassword(input.initialPassword);

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
        mustChangePassword,
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

/**
 * A doctor registering themselves, with no tenant-admin in the loop. Exactly one of two
 * paths, enforced by the Zod schema (`selfRegisterDoctorSchema`):
 *
 *  - `inviteCode` + `branchId`: joins a real clinic the doctor already works at. The code
 *    is looked up the same way the public "which clinic is this" endpoint does, so a stale
 *    or suspended tenant is rejected here too, not just at display time.
 *  - `newClinic`: the doctor has no clinic yet, so one is created for them — a
 *    `TenantType.INDEPENDENT_DOCTOR` tenant with a single branch — and they become that
 *    tenant's only doctor. This is the schema's own intended shape for a solo practice, not
 *    a workaround: `Doctor.tenantId` is required (every doctor belongs to *some* tenant),
 *    and this is how a doctor with no clinic satisfies that without an admin's involvement.
 *
 * Either way `verificationStatus` stays at its default (`PENDING`) — identical to a doctor
 * a TENANT_ADMIN creates today. Login and the /doctor dashboard are never gated on
 * verification (only SUSPENDED tenants block login, see auth.ts); `verified` only gates
 * whether the profile is searchable in the public marketplace. An admin still reviews it at
 * /admin/doctors before patients can find them there.
 */
export async function selfRegisterDoctor(input: SelfRegisterDoctorInput) {
  const email = normalizeEmail(input.email);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) throw new DoctorConflictError(`A user with email ${email} already exists.`);

  const passwordHash = await bcrypt.hash(input.password, 12);

  let tenantId: string;
  let branchId: string;
  let newTenant: { id: string; name: string } | null = null;

  if (input.inviteCode) {
    const tenant = await findTenantByInviteCode(input.inviteCode);
    if (!tenant) throw new InvalidInviteCodeError('Invalid or expired invite code.');
    const branch = tenant.branches.find((b) => b.id === input.branchId);
    if (!branch) throw new InvalidBranchError('That branch does not belong to this clinic.');
    tenantId = tenant.id;
    branchId = branch.id;
  } else {
    // input.newClinic — the schema guarantees exactly one of the two is present.
    const clinic = input.newClinic!;
    const created = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          type: 'INDEPENDENT_DOCTOR',
          name: clinic.name,
          nameAr: clinic.nameAr,
          countryId: clinic.countryId,
          status: 'PENDING_VERIFICATION',
          inviteCode: null,
        },
      });
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: clinic.branchName,
          address: clinic.branchAddress,
          cityId: clinic.cityId,
          phone: clinic.branchPhone,
          openingHours: {},
        },
      });
      // A solo practice has no TENANT_ADMIN — the doctor created below only ever holds
      // the DOCTOR role, which lacks `service:manage`. Without a bookable Service here,
      // this doctor could never be booked through any flow: Appointment.serviceId is
      // required and nothing else can create one for a tenant with no admin. The
      // consultation price the form already collects is exactly the price this service
      // needs, so this is what actually makes that field do something.
      const country = await tx.country.findUnique({ where: { id: clinic.countryId } });
      const specialty = await tx.specialty.findUnique({ where: { id: input.specialtyId } });
      await tx.service.create({
        data: {
          tenantId: tenant.id,
          specialtyId: input.specialtyId,
          name: specialty ? `${specialty.name} Consultation` : 'Consultation',
          nameAr: specialty ? `كشفية ${specialty.nameAr}` : 'كشفية',
          priceMinor: input.consultationPriceMinor,
          currency: country?.currency ?? 'JOD',
          durationMinutes: 20,
          type: 'IN_PERSON',
        },
      });
      return { tenant, branch };
    });
    tenantId = created.tenant.id;
    branchId = created.branch.id;
    newTenant = { id: created.tenant.id, name: created.tenant.name };
  }

  const doctor = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId,
        email,
        passwordHash,
        role: 'DOCTOR',
        name: input.name,
        nameAr: input.nameAr,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    });

    return tx.doctor.create({
      data: {
        userId: user.id,
        tenantId,
        specialtyId: input.specialtyId,
        licenseNumber: input.licenseNumber,
        yearsExperience: input.yearsExperience,
        gender: input.gender,
        languages: input.languages,
        consultationPriceMinor: input.consultationPriceMinor,
        bio: input.bio,
        bioAr: input.bioAr,
        branches: { create: [{ branchId }] },
      },
      include: DOCTOR_INCLUDE,
    });
  });

  await recordAudit({
    actorUserId: doctor.userId,
    tenantId,
    action: 'DOCTOR_SELF_REGISTERED',
    entityType: 'Doctor',
    entityId: doctor.id,
    afterState: { viaInviteCode: !!input.inviteCode, newTenant: newTenant?.id ?? null },
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

/**
 * Reset a doctor's password, tenant-scoped through the `Doctor` row rather than a direct
 * `User` lookup — `Doctor` is in `TENANT_REQUIRED_MODELS`, so this `findFirst` is
 * automatically confined to the caller's tenant by the middleware (running inside
 * `withTenantAuthorization`). A `TENANT_ADMIN` therefore cannot reach another tenant's
 * doctor by id no matter what id they pass, the same guarantee `getDoctor` relies on.
 */
export async function resetDoctorPassword(
  doctorId: string,
  newPassword: string | undefined,
  actor: SessionUser
): Promise<boolean> {
  const doctor = await db.doctor.findFirst({ where: { id: doctorId }, select: { userId: true } });
  if (!doctor) return false;
  await adminSetUserPassword(doctor.userId, newPassword, actor);
  return true;
}

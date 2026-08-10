import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { setWeeklyScheduleSchema, createScheduleExceptionSchema } from '@/lib/validation/schedule';

type SetWeeklyScheduleInput = z.infer<typeof setWeeklyScheduleSchema>;
type CreateScheduleExceptionInput = z.infer<typeof createScheduleExceptionSchema>;

export class DoctorNotInTenantError extends Error {}
export class InvalidBranchError extends Error {}

/**
 * Schedule/ScheduleException have no tenantId column (see prisma/schema.prisma) — they're
 * reached only through a doctor, so tenant isolation here is enforced explicitly rather
 * than by the Prisma middleware (which only knows about columns that exist). Every
 * function below takes an explicit `tenantId` and re-validates doctorId/branchId belong
 * to it, which also means these work identically whether called from a TENANT_ADMIN route
 * (tenantId = session.tenantId) or a DOCTOR self-service route (tenantId = the doctor's
 * own tenantId, resolved separately) — see src/app/api/v1/doctor/schedule/route.ts.
 */
async function assertDoctorInTenant(doctorId: string, tenantId: string) {
  const doctor = await db.doctor.findFirst({ where: { id: doctorId, tenantId } });
  if (!doctor) throw new DoctorNotInTenantError('Doctor does not exist or does not belong to this tenant.');
  return doctor;
}

async function assertBranchesInTenant(branchIds: string[], tenantId: string) {
  const unique = Array.from(new Set(branchIds));
  const branches = await db.branch.findMany({ where: { id: { in: unique }, tenantId } });
  if (branches.length !== unique.length) {
    throw new InvalidBranchError('One or more branches do not exist or do not belong to this tenant.');
  }
}

export async function getWeeklySchedule(doctorId: string, tenantId: string) {
  await assertDoctorInTenant(doctorId, tenantId);
  return db.schedule.findMany({ where: { doctorId }, include: { branch: true }, orderBy: { dayOfWeek: 'asc' } });
}

export async function setWeeklySchedule(
  doctorId: string,
  tenantId: string,
  input: SetWeeklyScheduleInput,
  actor: SessionUser
) {
  await assertDoctorInTenant(doctorId, tenantId);
  await assertBranchesInTenant(
    input.days.map((d) => d.branchId),
    tenantId
  );

  const schedules = await db.$transaction(async (tx) => {
    await tx.schedule.deleteMany({ where: { doctorId } });
    if (input.days.length === 0) return [];
    await tx.schedule.createMany({ data: input.days.map((day) => ({ ...day, doctorId })) });
    return tx.schedule.findMany({ where: { doctorId }, include: { branch: true }, orderBy: { dayOfWeek: 'asc' } });
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'SCHEDULE_SET',
    entityType: 'Doctor',
    entityId: doctorId,
    afterState: { dayCount: input.days.length },
  });

  return schedules;
}

export async function listScheduleExceptions(doctorId: string, tenantId: string) {
  await assertDoctorInTenant(doctorId, tenantId);
  return db.scheduleException.findMany({ where: { doctorId }, orderBy: { date: 'asc' } });
}

export async function createScheduleException(
  doctorId: string,
  tenantId: string,
  input: CreateScheduleExceptionInput,
  actor: SessionUser
) {
  await assertDoctorInTenant(doctorId, tenantId);
  await assertBranchesInTenant([input.branchId], tenantId);

  const exception = await db.scheduleException.create({
    data: { ...input, date: new Date(input.date), doctorId },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId,
    action: 'SCHEDULE_EXCEPTION_CREATED',
    entityType: 'Doctor',
    entityId: doctorId,
    afterState: { type: exception.type, date: input.date },
  });

  return exception;
}

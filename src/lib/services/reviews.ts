import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getAppointment } from '@/lib/services/appointments';
import type { SessionUser } from '@/lib/auth';
import type { ReviewStatus } from '@prisma/client';

export class NotOwnAppointmentError extends Error {}
export class AppointmentNotReviewableError extends Error {}
export class AlreadyReviewedError extends Error {}
export class ReviewNotFoundError extends Error {}
export class ReviewAlreadyDecidedError extends Error {}

export interface CreateReviewInput {
  appointmentId: string;
  ratingOverall: number;
  ratingDoctor: number;
  ratingStaff?: number;
  ratingWaitTime?: number;
  ratingClinic?: number;
  comment?: string;
}

/**
 * A patient may review only their own appointment, only once it is COMPLETED, and only
 * once — the schema's unique constraint on appointmentId is the hard backstop, this check
 * is what turns a duplicate attempt into a clean error instead of a Prisma constraint
 * violation. Starts PENDING; it does not affect Doctor.ratingAverage/ratingCount until a
 * tenant admin approves it (see moderateReview) — an unmoderated review must never move
 * the public number.
 */
export async function createReview(input: CreateReviewInput, actor: SessionUser) {
  const appointment = await getAppointment(input.appointmentId);
  if (!appointment) throw new ReviewNotFoundError('No appointment with that id.');

  const patient = await db.patient.findUnique({ where: { userId: actor.id } });
  if (!patient || patient.id !== appointment.patientId) {
    throw new NotOwnAppointmentError('This appointment does not belong to you.');
  }

  if (appointment.status !== 'COMPLETED') {
    throw new AppointmentNotReviewableError('Only a completed appointment can be reviewed.');
  }

  const existing = await db.review.findUnique({ where: { appointmentId: input.appointmentId } });
  if (existing) throw new AlreadyReviewedError('This appointment has already been reviewed.');

  const review = await db.review.create({
    data: {
      appointmentId: input.appointmentId,
      patientId: patient.id,
      doctorId: appointment.doctorId,
      tenantId: appointment.tenantId,
      ratingOverall: input.ratingOverall,
      ratingDoctor: input.ratingDoctor,
      ratingStaff: input.ratingStaff,
      ratingWaitTime: input.ratingWaitTime,
      ratingClinic: input.ratingClinic,
      comment: input.comment,
      status: 'PENDING',
    },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: appointment.tenantId,
    action: 'REVIEW_SUBMITTED',
    entityType: 'Review',
    entityId: review.id,
    afterState: { appointmentId: input.appointmentId, ratingOverall: input.ratingOverall, status: 'PENDING' },
  });

  return review;
}

const REVIEW_INCLUDE = {
  patient: { include: { user: { select: { name: true } } } },
  doctor: { include: { user: { select: { name: true } } } },
  appointment: { select: { scheduledAt: true } },
} as const;

/** Tenant-scoped by the ambient middleware — call inside runInSessionTenant/runWithTenant. */
export async function listTenantReviews(filters: { status?: ReviewStatus } = {}) {
  return db.review.findMany({
    where: { status: filters.status },
    include: REVIEW_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Recomputes the doctor's public rating from scratch off every APPROVED review, inside the
 * same transaction as the status write — never a partial view under concurrent moderation.
 */
export async function moderateReview(id: string, status: 'APPROVED' | 'REJECTED', actor: SessionUser) {
  const before = await db.review.findFirst({ where: { id } });
  if (!before) throw new ReviewNotFoundError('No review with that id.');
  if (before.status !== 'PENDING') {
    throw new ReviewAlreadyDecidedError(`This review was already ${before.status.toLowerCase()}.`);
  }

  const review = await db.$transaction(async (tx) => {
    const updated = await tx.review.update({ where: { id }, data: { status } });

    const approved = await tx.review.findMany({
      where: { doctorId: before.doctorId, status: 'APPROVED' },
      select: { ratingOverall: true },
    });
    const count = approved.length;
    const average = count > 0 ? approved.reduce((sum, r) => sum + r.ratingOverall, 0) / count : 0;
    await tx.doctor.update({
      where: { id: before.doctorId },
      data: { ratingAverage: average, ratingCount: count },
    });

    return updated;
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: before.tenantId,
    action: `REVIEW_${status}`,
    entityType: 'Review',
    entityId: id,
    beforeState: { status: before.status },
    afterState: { status },
  });

  return review;
}

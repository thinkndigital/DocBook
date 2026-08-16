import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import {
  createReview,
  moderateReview,
  listTenantReviews,
  NotOwnAppointmentError,
  AppointmentNotReviewableError,
  AlreadyReviewedError,
  ReviewAlreadyDecidedError,
} from '@/lib/services/reviews';
import { runWithTenant } from '@/lib/tenant';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

describe('reviews', () => {
  let world: TestWorld;
  let otherWorld: TestWorld;

  beforeAll(async () => {
    world = await createWorld('rev');
    otherWorld = await createWorld('rev2');
  });

  afterAll(async () => {
    await cleanupWorld(world);
    await cleanupWorld(otherWorld);
  });

  function bookingInput(scheduledAt: Date, w: TestWorld = world) {
    return {
      doctorId: w.doctorId,
      branchId: w.branchId,
      serviceId: w.serviceId,
      patientId: w.patientId,
      scheduledAt: scheduledAt.toISOString(),
      type: 'IN_PERSON' as const,
    };
  }

  async function completedAppointment(w: TestWorld = world, hourUtc = 9) {
    const appt = await createAppointment(bookingInput(futureSlot(3, hourUtc), w), w.staffSession);
    await db.appointment.update({ where: { id: appt.id }, data: { status: 'COMPLETED' } });
    return appt;
  }

  it('lets a patient review their own completed appointment, starting PENDING', async () => {
    const appt = await completedAppointment(world, 9);
    const review = await createReview(
      { appointmentId: appt.id, ratingOverall: 5, ratingDoctor: 5, comment: 'Great visit' },
      world.patientSession
    );
    expect(review.status).toBe('PENDING');
    expect(review.doctorId).toBe(world.doctorId);
    expect(review.tenantId).toBe(world.tenantId);
  });

  it('rejects a review for an appointment that is not COMPLETED', async () => {
    const appt = await createAppointment(bookingInput(futureSlot(3, 10)), world.staffSession);
    await expect(
      createReview({ appointmentId: appt.id, ratingOverall: 4, ratingDoctor: 4 }, world.patientSession)
    ).rejects.toThrow(AppointmentNotReviewableError);
  });

  it('rejects a second review for the same appointment', async () => {
    const appt = await completedAppointment(world, 11);
    await createReview({ appointmentId: appt.id, ratingOverall: 4, ratingDoctor: 4 }, world.patientSession);
    await expect(
      createReview({ appointmentId: appt.id, ratingOverall: 3, ratingDoctor: 3 }, world.patientSession)
    ).rejects.toThrow(AlreadyReviewedError);
  });

  it('rejects a review from a patient who was not on the appointment', async () => {
    const appt = await completedAppointment(otherWorld, 9);
    await expect(
      createReview({ appointmentId: appt.id, ratingOverall: 5, ratingDoctor: 5 }, world.patientSession)
    ).rejects.toThrow(NotOwnAppointmentError);
  });

  it('an unmoderated (PENDING) review does not move Doctor.ratingAverage/ratingCount', async () => {
    const before = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    const appt = await completedAppointment(world, 12);
    await createReview({ appointmentId: appt.id, ratingOverall: 1, ratingDoctor: 1 }, world.patientSession);
    const after = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(after.ratingAverage).toBe(before.ratingAverage);
    expect(after.ratingCount).toBe(before.ratingCount);
  });

  it('approving a review recomputes Doctor.ratingAverage/ratingCount from every approved review', async () => {
    const apptA = await completedAppointment(world, 13);
    const reviewA = await createReview({ appointmentId: apptA.id, ratingOverall: 4, ratingDoctor: 4 }, world.patientSession);
    await runWithTenant({ tenantId: world.tenantId, bypass: false }, () =>
      moderateReview(reviewA.id, 'APPROVED', world.staffSession)
    );

    const doctorAfterOne = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(doctorAfterOne.ratingCount).toBe(1);
    expect(doctorAfterOne.ratingAverage).toBe(4);

    const apptB = await completedAppointment(world, 14);
    const reviewB = await createReview({ appointmentId: apptB.id, ratingOverall: 2, ratingDoctor: 2 }, world.patientSession);
    await runWithTenant({ tenantId: world.tenantId, bypass: false }, () =>
      moderateReview(reviewB.id, 'APPROVED', world.staffSession)
    );

    const doctorAfterTwo = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(doctorAfterTwo.ratingCount).toBe(2);
    expect(doctorAfterTwo.ratingAverage).toBe(3); // (4 + 2) / 2
  });

  it('a rejected review never counts toward the rating', async () => {
    const before = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    const appt = await completedAppointment(world, 15);
    const review = await createReview({ appointmentId: appt.id, ratingOverall: 1, ratingDoctor: 1 }, world.patientSession);
    await runWithTenant({ tenantId: world.tenantId, bypass: false }, () =>
      moderateReview(review.id, 'REJECTED', world.staffSession)
    );
    const after = await db.doctor.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(after.ratingAverage).toBe(before.ratingAverage);
    expect(after.ratingCount).toBe(before.ratingCount);
  });

  it('a review can only be decided once', async () => {
    const appt = await completedAppointment(world, 16);
    const review = await createReview({ appointmentId: appt.id, ratingOverall: 5, ratingDoctor: 5 }, world.patientSession);
    await runWithTenant({ tenantId: world.tenantId, bypass: false }, () =>
      moderateReview(review.id, 'APPROVED', world.staffSession)
    );
    await expect(
      runWithTenant({ tenantId: world.tenantId, bypass: false }, () => moderateReview(review.id, 'REJECTED', world.staffSession))
    ).rejects.toThrow(ReviewAlreadyDecidedError);
  });

  it('tenant isolation: a second tenant cannot see or moderate the first tenant\'s review', async () => {
    const appt = await completedAppointment(world, 17);
    const review = await createReview({ appointmentId: appt.id, ratingOverall: 5, ratingDoctor: 5 }, world.patientSession);

    const otherTenantReviews = await runWithTenant({ tenantId: otherWorld.tenantId, bypass: false }, () =>
      listTenantReviews({ status: 'PENDING' })
    );
    expect(otherTenantReviews.find((r) => r.id === review.id)).toBeUndefined();

    // findFirst inside the wrong tenant context returns nothing (isolation), not a leak.
    await expect(
      runWithTenant({ tenantId: otherWorld.tenantId, bypass: false }, () =>
        moderateReview(review.id, 'APPROVED', otherWorld.staffSession)
      )
    ).rejects.toThrow();
  });
});

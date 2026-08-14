import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment, cancelOwnAppointment, SlotTakenError, SlotUnavailableError } from '@/lib/services/appointments';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

/**
 * THE non-negotiable from the brief: "Two users must NEVER be able to successfully book the
 * same appointment slot."
 *
 * This has been demonstrated by hand at the end of every phase since Phase 4. That was
 * always a weak guarantee — a manual check proves the code worked on the afternoon someone
 * remembered to run it. This file is the point at which it becomes a property the build
 * enforces.
 *
 * It runs against a real Postgres for a specific reason: the guarantee is not implemented in
 * TypeScript. It is a partial unique index plus a `SERIALIZABLE` transaction, and both live
 * below anything a mock could stand in for. A mocked version of this test would assert that
 * my test double rejects duplicates, which proves nothing about the product.
 */

let world: TestWorld;

beforeAll(async () => {
  world = await createWorld('booking');
});

afterAll(async () => {
  await cleanupWorld(world);
});

function bookingInput(scheduledAt: Date) {
  return {
    doctorId: world.doctorId,
    branchId: world.branchId,
    serviceId: world.serviceId,
    patientId: world.patientId,
    scheduledAt: scheduledAt.toISOString(),
    type: 'IN_PERSON' as const,
  };
}

describe('double-booking guarantee', () => {
  it('lets exactly one of five simultaneous bookings win the same slot', async () => {
    const slot = futureSlot(3, 10);

    // Fired without awaiting in between: these genuinely race inside Postgres. Sequential
    // calls would pass against a broken implementation, which is the trap this avoids.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createAppointment(bookingInput(slot), world.staffSession))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    // Every loser must fail for the *right* reason. A rejection caused by a null
    // dereference would also produce 1 winner and 4 losers while meaning the opposite.
    for (const failure of rejected as PromiseRejectedResult[]) {
      expect(
        failure.reason instanceof SlotTakenError || failure.reason instanceof SlotUnavailableError,
        `expected a slot-conflict error, got: ${failure.reason}`
      ).toBe(true);
    }

    // The database is the real assertion: exactly one active row for that slot.
    const rows = await db.appointment.findMany({
      where: { doctorId: world.doctorId, branchId: world.branchId, scheduledAt: slot },
    });
    expect(rows).toHaveLength(1);
  });

  it('holds under a larger burst', async () => {
    const slot = futureSlot(4, 11);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => createAppointment(bookingInput(slot), world.staffSession))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const active = await db.appointment.count({
      where: {
        doctorId: world.doctorId,
        branchId: world.branchId,
        scheduledAt: slot,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });
    expect(active).toBe(1);
  });

  it('rejects a sequential second booking of a taken slot', async () => {
    const slot = futureSlot(5, 12);

    await createAppointment(bookingInput(slot), world.staffSession);
    await expect(createAppointment(bookingInput(slot), world.staffSession)).rejects.toThrow();
  });

  it('frees the slot again once the appointment is cancelled', async () => {
    const slot = futureSlot(6, 13);

    const first = await createAppointment(bookingInput(slot), world.staffSession);
    await cancelOwnAppointment(first.id, 'changed my mind', world.patientSession);

    // This is the behaviour the *partial* unique index exists for: a plain unique index
    // would keep the slot blocked forever by a cancelled row, quietly costing the clinic
    // every cancelled appointment's worth of capacity.
    const second = await createAppointment(bookingInput(slot), world.staffSession);
    expect(second.id).not.toBe(first.id);

    const active = await db.appointment.count({
      where: {
        doctorId: world.doctorId,
        branchId: world.branchId,
        scheduledAt: slot,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });
    expect(active).toBe(1);
  });

  it('keeps two different doctors independent at the same instant', async () => {
    const other = await createWorld('booking-2');
    try {
      const slot = futureSlot(7, 14);

      const [a, b] = await Promise.all([
        createAppointment(bookingInput(slot), world.staffSession),
        createAppointment(
          {
            doctorId: other.doctorId,
            branchId: other.branchId,
            serviceId: other.serviceId,
            patientId: other.patientId,
            scheduledAt: slot.toISOString(),
            type: 'IN_PERSON' as const,
          },
          other.staffSession
        ),
      ]);

      // The constraint must be per doctor+branch+slot, not global on the timestamp —
      // otherwise one clinic's booking blocks every other clinic in the country.
      expect(a.id).not.toBe(b.id);
    } finally {
      await cleanupWorld(other);
    }
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import { computeCommissionSplit } from '@/lib/services/commissions';
import {
  ClinicalAccessDeniedError,
  assertCanAccessPatientRecords,
  resolveClinicalActor,
} from '@/lib/services/clinical-access';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';
import type { SessionUser } from '@/lib/auth';

/**
 * Two invariants that are expensive to get wrong and cheap to assert:
 *
 * 1. **A commission split sums to the booking price, exactly.** The clinic takes the
 *    remainder rather than its own percentage, so rounding cannot mint or destroy money.
 *    This is asserted at deliberately awkward prices where naive percentage arithmetic
 *    leaves a fils behind.
 * 2. **Clinical access is decided by treatment relationship, not role seniority.** Every
 *    role that should get nothing is checked individually — including SUPER_ADMIN, which
 *    is the one most likely to be "helpfully" granted access later.
 */

let world: TestWorld;

beforeAll(async () => {
  world = await createWorld('money');
});

afterAll(async () => {
  await cleanupWorld(world);
});

async function bookAt(hour: number, priceMinor?: number) {
  const appointment = await createAppointment(
    {
      doctorId: world.doctorId,
      branchId: world.branchId,
      serviceId: world.serviceId,
      patientId: world.patientId,
      scheduledAt: futureSlot(10, hour).toISOString(),
      type: 'IN_PERSON',
    },
    world.staffSession
  );
  if (priceMinor !== undefined) {
    await db.appointment.update({ where: { id: appointment.id }, data: { priceMinor } });
  }
  return appointment;
}

describe('commission split', () => {
  it('always sums to exactly the booking price, including at awkward amounts', async () => {
    // 3333 and 10001 are chosen because percentage arithmetic on them rounds badly; if the
    // clinic were paid its own percentage rather than the remainder, these would drift.
    const prices = [5000, 3333, 10001, 1, 99999];

    for (const [index, price] of prices.entries()) {
      const appointment = await bookAt(8 + index, price);
      const split = await computeCommissionSplit(appointment.id);

      expect(split, `no split computed for price ${price}`).not.toBeNull();
      const sum = split!.shares.reduce((total, share) => total + share.amountMinor, 0);

      expect(sum, `split for ${price} summed to ${sum}`).toBe(price);
      expect(split!.totalMinor).toBe(price);
    }
  });

  it('never produces a negative share', async () => {
    const appointment = await bookAt(15, 7);
    const split = await computeCommissionSplit(appointment.id);

    for (const share of split!.shares) {
      expect(share.amountMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns null for an appointment that does not exist', async () => {
    expect(await computeCommissionSplit('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('clinical access control', () => {
  const roles: Array<{ role: SessionUser['role']; label: string }> = [
    { role: 'SUPER_ADMIN', label: 'platform operator' },
    { role: 'TENANT_ADMIN', label: 'clinic manager' },
    { role: 'RECEPTIONIST', label: 'receptionist' },
    { role: 'REPRESENTATIVE', label: 'sales representative' },
  ];

  for (const { role, label } of roles) {
    it(`denies a ${label} entirely`, async () => {
      const session: SessionUser = {
        id: world.staffSession.id,
        email: world.staffSession.email,
        name: world.staffSession.name,
        role,
        tenantId: world.tenantId,
        locale: 'ar',
        mustChangePassword: false,
      };

      await expect(resolveClinicalActor(session)).rejects.toBeInstanceOf(ClinicalAccessDeniedError);
    });
  }

  it('lets a patient read their own records and nobody else', async () => {
    const actor = await resolveClinicalActor(world.patientSession);

    await expect(assertCanAccessPatientRecords(actor, world.patientId)).resolves.toBeUndefined();

    const other = await createWorld('money-other');
    try {
      await expect(assertCanAccessPatientRecords(actor, other.patientId)).rejects.toBeInstanceOf(
        ClinicalAccessDeniedError
      );
    } finally {
      await cleanupWorld(other);
    }
  });

  it('requires an actual appointment before a doctor may read a chart', async () => {
    const doctorSession: SessionUser = {
      id: world.doctorUserId,
      email: `${world.token}-doctor@test.local`,
      name: 'Doctor',
      role: 'DOCTOR',
      tenantId: world.tenantId,
      locale: 'ar',
      mustChangePassword: false,
    };
    const actor = await resolveClinicalActor(doctorSession);

    // This world's doctor has treated this patient (bookings above), so access is allowed.
    await expect(assertCanAccessPatientRecords(actor, world.patientId)).resolves.toBeUndefined();

    // A patient at another clinic, with no appointment: denied. Being a doctor is not
    // itself authority over a chart.
    const stranger = await createWorld('money-stranger');
    try {
      await expect(assertCanAccessPatientRecords(actor, stranger.patientId)).rejects.toBeInstanceOf(
        ClinicalAccessDeniedError
      );
    } finally {
      await cleanupWorld(stranger);
    }
  });
});

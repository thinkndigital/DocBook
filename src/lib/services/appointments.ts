import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { Prisma, type AppointmentStatus } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createAppointmentSchema, appointmentStatusSchema } from '@/lib/validation/appointment';
import { getAvailableSlots } from '@/lib/services/availability';
import { findPatientByEmail, registerPatient, PatientConflictError } from '@/lib/services/patients';
import { getOwnRepresentative, assertRepAssignedToTenant } from '@/lib/services/representatives';
import { dispatchNotificationAsync } from '@/lib/services/notifications';
import type { NotificationEvent } from '@/lib/notifications/templates';

type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
type AppointmentStatusInput = z.infer<typeof appointmentStatusSchema>;

export class SlotUnavailableError extends Error {}
export class SlotTakenError extends Error {}
export class InvalidReferenceError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class NotReschedulableError extends Error {}

const APPOINTMENT_INCLUDE = {
  patient: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  doctor: { include: { user: { select: { id: true, name: true } }, specialty: true } },
  branch: { select: { id: true, name: true } },
  service: { select: { id: true, name: true, nameAr: true, priceMinor: true, currency: true } },
} as const;

function dateKey(scheduledAt: Date): string {
  return scheduledAt.toISOString().slice(0, 10);
}

function formatWhen(scheduledAt: Date): string {
  return scheduledAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Notifies the patient about one of their appointments. Fire-and-forget by design. */
function notifyPatient(
  event: NotificationEvent,
  appointment: {
    tenantId: string;
    queueToken: number | null;
    scheduledAt: Date;
    patient: { user: { id: string } };
    doctor: { user: { name: string } };
    branch: { name: string };
  },
  extra: Record<string, string | number> = {}
) {
  dispatchNotificationAsync({
    event,
    userId: appointment.patient.user.id,
    tenantId: appointment.tenantId,
    vars: {
      doctorName: appointment.doctor.user.name,
      branchName: appointment.branch.name,
      when: formatWhen(appointment.scheduledAt),
      queueToken: appointment.queueToken ?? undefined,
      ...extra,
    },
  });
}

async function resolveSlotDuration(doctorId: string, branchId: string, scheduledAt: Date): Promise<number> {
  const dayOfWeek = scheduledAt.getUTCDay();
  const schedule = await db.schedule.findFirst({ where: { doctorId, branchId, dayOfWeek, isActive: true } });
  if (!schedule) throw new SlotUnavailableError('No schedule found for this doctor/branch/day.');
  return schedule.slotDurationMinutes;
}

async function nextQueueToken(doctorId: string, branchId: string, date: string): Promise<number> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const count = await db.appointment.count({
    where: { doctorId, branchId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
  });
  return count + 1;
}

/**
 * Shared by tenant-staff booking (receptionist/tenant admin booking on behalf of a
 * patient) and patient self-booking (Phase 5). tenantId is derived from the doctor being
 * booked, not from the actor — a PATIENT has no tenantId and must be able to book any
 * tenant's doctor; a staff actor's tenantId is checked *against* the doctor's tenantId
 * instead of used to look the doctor up, so booking another tenant's doctor 404s rather
 * than silently cross-linking.
 */
/**
 * Retries a transaction that Postgres aborted for serialization reasons.
 *
 * `SERIALIZABLE` does not only reject genuinely conflicting writes. Postgres takes
 * *predicate* locks, so two transactions whose read sets overlap can both be aborted with
 * SQLSTATE 40001 ("could not serialize access") even when they would have written
 * different rows — two different clinics booking the same wall-clock instant is exactly
 * that shape. Prisma surfaces it as P2034.
 *
 * Before this existed, that abort propagated as an unhandled error: a 500 on a booking
 * that was never in conflict with anything. Found by the Phase 12 suite, where the
 * "two different doctors at the same instant" case failed roughly one run in three.
 *
 * Retrying is safe. The invariant is enforced by the partial unique index and a fresh
 * transaction, so a retry that races a genuine double-booking still loses on P2002 and
 * becomes SlotTakenError. Attempts are bounded and jittered so a burst doesn't
 * resynchronise into another collision.
 */
const SERIALIZATION_RETRY_ATTEMPTS = 4;

async function withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < SERIALIZATION_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isSerializationFailure =
        err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2034' || err.code === 'P2037');
      if (!isSerializationFailure) throw err;

      lastError = err;
      // 10-30ms, 20-60ms, 40-120ms: enough to break the tie, short enough that a patient
      // never perceives it.
      const backoffMs = 10 * 2 ** attempt * (1 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

export async function createAppointment(input: CreateAppointmentInput, actor: SessionUser) {
  const doctor = await db.doctor.findUnique({ where: { id: input.doctorId } });
  if (!doctor) throw new InvalidReferenceError('Doctor does not exist.');
  if (actor.tenantId && actor.tenantId !== doctor.tenantId) {
    throw new InvalidReferenceError('Doctor does not exist or does not belong to this tenant.');
  }
  const tenantId = doctor.tenantId;

  // A representative has no tenantId, so the staff check above never constrains them —
  // their reach is bounded by RepresentativeAssignment instead. Resolve the rep row here
  // so the booking is attributed to them (bookedByRepresentativeId) for the Phase 7
  // commission engine and the rep dashboard.
  let representativeId: string | null = null;
  if (actor.role === 'REPRESENTATIVE') {
    const rep = await getOwnRepresentative(actor.id);
    if (!rep) throw new InvalidReferenceError('No representative profile for this account.');
    await assertRepAssignedToTenant(rep.id, tenantId);
    representativeId = rep.id;
  }

  const [branch, service] = await Promise.all([
    db.branch.findFirst({ where: { id: input.branchId, tenantId } }),
    db.service.findFirst({ where: { id: input.serviceId, tenantId } }),
  ]);
  if (!branch || !service) {
    throw new InvalidReferenceError('Branch or service does not exist or does not belong to this doctor\'s tenant.');
  }

  let patientId: string | undefined;
  if (actor.role === 'PATIENT') {
    // Patients can only ever book for themselves in this phase — family-member booking
    // (brief §2 "manage family members") is deferred; patientId/newPatient in the input
    // are ignored for this role regardless of what a client sends.
    const ownPatient = await db.patient.findUnique({ where: { userId: actor.id } });
    if (!ownPatient) throw new InvalidReferenceError('No patient profile for this account.');
    patientId = ownPatient.id;
  } else {
    patientId = input.patientId;
    if (!patientId && input.newPatient) {
      try {
        const patient = await registerPatient(input.newPatient, actor, tenantId);
        patientId = patient.id;
      } catch (err) {
        if (err instanceof PatientConflictError) {
          const existing = await findPatientByEmail(input.newPatient.email);
          if (!existing) throw err;
          patientId = existing.id;
        } else {
          throw err;
        }
      }
    }
  }
  if (!patientId) throw new InvalidReferenceError('No patient specified.');

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new InvalidReferenceError('Patient does not exist.');

  const scheduledAt = new Date(input.scheduledAt);
  const date = dateKey(scheduledAt);

  const available = await getAvailableSlots(input.doctorId, input.branchId, date);
  if (!available.includes(scheduledAt.toISOString())) {
    throw new SlotUnavailableError('This slot is not available.');
  }

  const durationMinutes = await resolveSlotDuration(input.doctorId, input.branchId, scheduledAt);
  const queueToken = await nextQueueToken(input.doctorId, input.branchId, date);

  try {
    const appointment = await withSerializationRetry(() =>
      db.$transaction(
        async (tx) =>
          tx.appointment.create({
            data: {
              tenantId,
              branchId: input.branchId,
              doctorId: input.doctorId,
              patientId,
              serviceId: input.serviceId,
              bookedByUserId: actor.id,
              bookedByRepresentativeId: representativeId,
              type: input.type,
              status: 'CONFIRMED',
              scheduledAt,
              durationMinutes,
              queueToken,
              priceMinor: service.priceMinor,
              currency: service.currency,
              notes: input.notes,
            },
            include: APPOINTMENT_INCLUDE,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );

    await recordAudit({
      actorUserId: actor.id,
      tenantId,
      action: 'APPOINTMENT_CREATED',
      entityType: 'Appointment',
      entityId: appointment.id,
      afterState: { doctorId: input.doctorId, scheduledAt: input.scheduledAt, queueToken },
    });

    notifyPatient('BOOKING_CREATED', appointment);

    return appointment;
  } catch (err) {
    // The partial unique index (appointment_slot_unique, see prisma/migrations) is the
    // real backstop against a race between the availability check above and this insert
    // — two concurrent requests for the same slot can both pass getAvailableSlots, but
    // only one insert can win here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new SlotTakenError('This slot was just booked by someone else.');
    }
    throw err;
  }
}

export async function listAppointments(filters: { date?: string; branchId?: string; doctorId?: string }) {
  const where: Prisma.AppointmentWhereInput = {};
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.doctorId) where.doctorId = filters.doctorId;
  if (filters.date) {
    const dayStart = new Date(`${filters.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    where.scheduledAt = { gte: dayStart, lt: dayEnd };
  }
  return db.appointment.findMany({ where, include: APPOINTMENT_INCLUDE, orderBy: { scheduledAt: 'asc' } });
}

export async function getAppointment(id: string) {
  return db.appointment.findFirst({ where: { id }, include: APPOINTMENT_INCLUDE });
}

const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_QUEUE', 'CANCELLED'],
  IN_QUEUE: ['CALLED', 'CANCELLED'],
  CALLED: ['IN_CONSULTATION', 'NO_SHOW', 'CANCELLED'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
};

const STATUS_TIMESTAMP_FIELD: Partial<Record<AppointmentStatus, string>> = {
  CHECKED_IN: 'checkedInAt',
  CALLED: 'calledAt',
  IN_CONSULTATION: 'startedAt',
  COMPLETED: 'completedAt',
};

export async function setAppointmentStatus(id: string, input: AppointmentStatusInput, actor: SessionUser) {
  const before = await getAppointment(id);
  if (!before) return null;

  const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
  if (!allowed.includes(input.status)) {
    throw new InvalidStatusTransitionError(`Cannot move appointment from ${before.status} to ${input.status}.`);
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[input.status];

  const appointment = await db.appointment.update({
    where: { id },
    data: {
      status: input.status,
      cancelReason: input.status === 'CANCELLED' ? input.cancelReason : undefined,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
    include: APPOINTMENT_INCLUDE,
  });

  await db.queueEvent.create({ data: { appointmentId: id, status: input.status } });

  // Queue-position and cancellation events the patient actually needs to see.
  const STATUS_EVENT: Partial<Record<AppointmentStatus, NotificationEvent>> = {
    IN_QUEUE: 'QUEUE_APPROACHING',
    CALLED: 'PATIENT_CALLED',
    CANCELLED: 'BOOKING_CANCELLED',
    COMPLETED: 'REVIEW_REQUEST',
  };
  const event = STATUS_EVENT[input.status];
  if (event) notifyPatient(event, appointment);

  await recordAudit({
    actorUserId: actor.id,
    tenantId: before.tenantId,
    action: `APPOINTMENT_${input.status}`,
    entityType: 'Appointment',
    entityId: id,
    beforeState: { status: before.status },
    afterState: { status: appointment.status },
  });

  return appointment;
}

const NON_RESCHEDULABLE: AppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'];

export class NotOwnAppointmentError extends Error {}

async function assertCanModify(before: NonNullable<Awaited<ReturnType<typeof getAppointment>>>, actor: SessionUser) {
  if (actor.role === 'PATIENT') {
    const ownPatient = await db.patient.findUnique({ where: { userId: actor.id } });
    if (!ownPatient || ownPatient.id !== before.patientId) {
      throw new NotOwnAppointmentError('This appointment does not belong to you.');
    }
  } else if (actor.role === 'REPRESENTATIVE') {
    // Reps are tenant-less, so the tenant check below never constrains them — they may
    // only touch bookings they themselves made.
    const rep = await getOwnRepresentative(actor.id);
    if (!rep || before.bookedByRepresentativeId !== rep.id) {
      throw new NotOwnAppointmentError('This appointment was not booked by you.');
    }
  } else if (actor.tenantId && actor.tenantId !== before.tenantId) {
    throw new NotOwnAppointmentError('This appointment does not belong to your tenant.');
  }
}

export async function rescheduleAppointment(id: string, newScheduledAtIso: string, actor: SessionUser) {
  const before = await getAppointment(id);
  if (!before) return null;
  await assertCanModify(before, actor);

  if (NON_RESCHEDULABLE.includes(before.status)) {
    throw new NotReschedulableError(`Cannot reschedule an appointment with status ${before.status}.`);
  }

  const newScheduledAt = new Date(newScheduledAtIso);
  const date = dateKey(newScheduledAt);

  const available = await getAvailableSlots(before.doctorId, before.branchId, date);
  // The slot currently held by this appointment is (correctly) excluded from availability
  // by getAvailableSlots — add it back in so rescheduling to the same day doesn't
  // spuriously see its own old slot as "available" twice, and so a same-slot "reschedule"
  // (a no-op) is still treated as valid.
  const availableIncludingOwnSlot = new Set(available);
  if (date === dateKey(before.scheduledAt)) availableIncludingOwnSlot.add(before.scheduledAt.toISOString());

  if (!availableIncludingOwnSlot.has(newScheduledAt.toISOString())) {
    throw new SlotUnavailableError('This slot is not available.');
  }

  const durationMinutes = await resolveSlotDuration(before.doctorId, before.branchId, newScheduledAt);
  const queueToken = await nextQueueToken(before.doctorId, before.branchId, date);

  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.appointment.update({ where: { id: before.id }, data: { status: 'RESCHEDULED' } });
        return tx.appointment.create({
          data: {
            tenantId: before.tenantId,
            branchId: before.branchId,
            doctorId: before.doctorId,
            patientId: before.patientId,
            serviceId: before.serviceId,
            bookedByUserId: actor.id,
            // Attribution survives a reschedule: the rep who generated the original
            // booking keeps it for the Phase 7 commission engine, whoever rescheduled.
            bookedByRepresentativeId: before.bookedByRepresentativeId,
            type: before.type,
            status: 'CONFIRMED',
            scheduledAt: newScheduledAt,
            durationMinutes,
            queueToken,
            priceMinor: before.priceMinor,
            currency: before.currency,
            notes: before.notes,
          },
          include: APPOINTMENT_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await recordAudit({
      actorUserId: actor.id,
      tenantId: before.tenantId,
      action: 'APPOINTMENT_RESCHEDULED',
      entityType: 'Appointment',
      entityId: before.id,
      beforeState: { scheduledAt: before.scheduledAt },
      afterState: { newAppointmentId: result.id, scheduledAt: newScheduledAtIso },
    });

    notifyPatient('BOOKING_RESCHEDULED', result);

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new SlotTakenError('This slot was just booked by someone else.');
    }
    throw err;
  }
}

export async function listOwnDoctorAppointments(userId: string, filters: { date?: string }) {
  const doctor = await db.doctor.findUnique({ where: { userId } });
  if (!doctor) return null;
  return listAppointments({ doctorId: doctor.id, date: filters.date });
}

export async function listOwnPatientAppointments(userId: string) {
  const patient = await db.patient.findUnique({ where: { userId } });
  if (!patient) return null;
  return db.appointment.findMany({
    where: { patientId: patient.id },
    include: APPOINTMENT_INCLUDE,
    orderBy: { scheduledAt: 'desc' },
  });
}

/**
 * Deliberately separate from setAppointmentStatus (used by staff): a patient may only
 * ever cancel their own appointment, never set CHECKED_IN/CALLED/COMPLETED/etc, which are
 * clinical/front-desk actions. setAppointmentStatus also relies on the ambient tenant
 * context to keep staff within their own tenant (getAppointment is scoped when called
 * inside runWithTenant) — patient routes have no tenant context at all, so this function
 * does its own explicit ownership check rather than assuming that protection exists.
 */
export async function cancelOwnAppointment(id: string, cancelReason: string | undefined, actor: SessionUser) {
  const before = await getAppointment(id);
  if (!before) return null;
  await assertCanModify(before, actor);

  const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
  if (!allowed.includes('CANCELLED')) {
    throw new InvalidStatusTransitionError(`Cannot cancel an appointment with status ${before.status}.`);
  }

  const appointment = await db.appointment.update({
    where: { id },
    data: { status: 'CANCELLED', cancelReason },
    include: APPOINTMENT_INCLUDE,
  });

  await db.queueEvent.create({ data: { appointmentId: id, status: 'CANCELLED' } });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: before.tenantId,
    action: 'APPOINTMENT_CANCELLED',
    entityType: 'Appointment',
    entityId: id,
    beforeState: { status: before.status },
    afterState: { status: 'CANCELLED', cancelReason },
  });

  notifyPatient('BOOKING_CANCELLED', appointment);

  return appointment;
}

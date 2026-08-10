import { db } from '@/lib/db';

export class DoctorNotInTenantError extends Error {}

interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/**
 * Computes open slots for one doctor+branch+date.
 *
 * Known simplifications (fine for Phase 4, flagged for later):
 * - The slot grid is generated from the doctor's `Schedule.slotDurationMinutes` for that
 *   day, not the individual `Service.durationMinutes` being booked — every service shares
 *   the doctor's fixed appointment-slot length. Variable-length slot packing (e.g. a
 *   60-minute service consuming three 20-minute grid slots) is not implemented; the
 *   booked `Appointment.durationMinutes` is always the schedule's slot length.
 * - `date` is treated as a UTC calendar day (`${date}T${time}:00.000Z`), not adjusted for
 *   `Country.timezone` — real timezone-aware scheduling is a later-phase refinement (see
 *   ARCHITECTURE.md "Country configuration").
 */
export async function getAvailableSlots(doctorId: string, branchId: string, tenantId: string, date: string) {
  const doctor = await db.doctor.findFirst({ where: { id: doctorId, tenantId } });
  if (!doctor) throw new DoctorNotInTenantError('Doctor does not exist or does not belong to this tenant.');

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayOfWeek = dayStart.getUTCDay();

  const schedules = await db.schedule.findMany({
    where: { doctorId, branchId, dayOfWeek, isActive: true },
  });
  if (schedules.length === 0) return [];

  const exceptions = await db.scheduleException.findMany({
    where: { doctorId, branchId, date: dayStart },
  });

  const fullDayBlocked = exceptions.some(
    (ex) => (ex.type === 'HOLIDAY' || ex.type === 'EMERGENCY_CLOSURE') && !ex.startTime
  );
  if (fullDayBlocked) return [];

  const blockedRanges: TimeRange[] = exceptions
    .filter((ex) => ex.startTime && ex.endTime)
    .map((ex) => ({ startMinutes: toMinutes(ex.startTime!), endMinutes: toMinutes(ex.endTime!) }));

  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const bookedAppointments = await db.appointment.findMany({
    where: {
      doctorId,
      branchId,
      scheduledAt: { gte: dayStart, lt: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: { scheduledAt: true },
  });
  const bookedTimestamps = new Set(bookedAppointments.map((a) => a.scheduledAt.toISOString()));

  const slots: string[] = [];

  for (const schedule of schedules) {
    const step = schedule.slotDurationMinutes + schedule.bufferMinutes;
    const startMinutes = toMinutes(schedule.startTime);
    const endMinutes = toMinutes(schedule.endTime);

    for (let m = startMinutes; m + schedule.slotDurationMinutes <= endMinutes; m += step) {
      const slotRange: TimeRange = { startMinutes: m, endMinutes: m + schedule.slotDurationMinutes };
      if (blockedRanges.some((blocked) => overlaps(slotRange, blocked))) continue;

      const slotDate = new Date(dayStart);
      slotDate.setUTCMinutes(m);
      const iso = slotDate.toISOString();

      if (bookedTimestamps.has(iso)) continue;
      slots.push(iso);
    }
  }

  return slots.sort();
}

import { z } from 'zod';

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

export const scheduleDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  branchId: z.string().uuid(),
  startTime: timeString,
  endTime: timeString,
  slotDurationMinutes: z.number().int().min(5).max(240).default(20),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  isActive: z.boolean().default(true),
});

/** Replaces the doctor's entire weekly schedule in one call — simpler than incremental patch/delete for a 7-row set. */
export const setWeeklyScheduleSchema = z.object({
  days: z.array(scheduleDaySchema).max(7),
});

export const createScheduleExceptionSchema = z.object({
  branchId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  type: z.enum(['HOLIDAY', 'LEAVE', 'EMERGENCY_CLOSURE']),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  reason: z.string().max(300).optional(),
});

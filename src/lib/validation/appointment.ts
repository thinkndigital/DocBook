import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

const newPatientSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(200),
  phone: z.string().max(30).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createAppointmentSchema = z
  .object({
    doctorId: z.string().uuid(),
    branchId: z.string().uuid(),
    serviceId: z.string().uuid(),
    scheduledAt: z.string().datetime(),
    type: z.enum(['IN_PERSON', 'VIDEO', 'FOLLOW_UP', 'EMERGENCY', 'HOME_VISIT']).default('IN_PERSON'),
    patientId: z.string().uuid().optional(),
    newPatient: newPatientSchema.optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => Boolean(v.patientId) !== Boolean(v.newPatient), {
    message: 'Provide exactly one of patientId or newPatient.',
  });

export const appointmentStatusSchema = z.object({
  status: z.enum([
    'CONFIRMED',
    'CHECKED_IN',
    'IN_QUEUE',
    'CALLED',
    'IN_CONSULTATION',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ]),
  cancelReason: z.string().max(500).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  scheduledAt: z.string().datetime(),
});

/** Patient self-booking — no patientId/newPatient; createAppointment resolves the caller's own patient record for PATIENT actors. */
export const patientBookAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  type: z.enum(['IN_PERSON', 'VIDEO', 'FOLLOW_UP', 'EMERGENCY', 'HOME_VISIT']).default('IN_PERSON'),
  notes: z.string().max(1000).optional(),
});

export const cancelAppointmentSchema = z.object({
  cancelReason: z.string().max(500).optional(),
});

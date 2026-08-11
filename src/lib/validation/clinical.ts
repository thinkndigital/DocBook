import { z } from 'zod';

/** patientId is NOT accepted in the body — the route path is authoritative for whose chart is written to. */
export const createMedicalRecordSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  type: z.enum(['VISIT_NOTE', 'LAB_REPORT', 'IMAGING', 'DIAGNOSIS']),
  diagnosis: z.string().max(2000).optional(),
  notes: z.string().max(10000).optional(),
});

export const createPrescriptionSchema = z.object({
  appointmentId: z.string().uuid(),
  diagnosis: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  medications: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        dosage: z.string().min(1).max(100),
        frequency: z.string().min(1).max(100),
        durationDays: z.number().int().min(1).max(365).optional(),
        instructions: z.string().max(500).optional(),
      })
    )
    .min(1, 'A prescription needs at least one medication.')
    .max(30),
});

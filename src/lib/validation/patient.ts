import { z } from 'zod';

export const registerPatientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  phone: z.string().max(30).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

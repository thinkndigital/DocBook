import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

export const createRepresentativeSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200).optional(),
  monthlyTargetAmount: z.number().int().min(0).optional(), // minor units
  // See createDoctorSchema in validation/tenant.ts — same rule, same reasoning.
  initialPassword: z.string().min(1).max(200).optional(),
});

export const repAssignmentSchema = z.object({
  tenantId: z.string().uuid(),
});

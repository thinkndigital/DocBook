import { z } from 'zod';

export const createRepresentativeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200).optional(),
  monthlyTargetAmount: z.number().int().min(0).optional(), // minor units
});

export const repAssignmentSchema = z.object({
  tenantId: z.string().uuid(),
});

import { z } from 'zod';

export const updateOwnDoctorProfileSchema = z.object({
  bio: z.string().max(2000).optional(),
  bioAr: z.string().max(2000).optional(),
  languages: z.array(z.string().min(2).max(30)).optional(),
  consultationPriceMinor: z.number().int().min(0).optional(),
});

export const verifyDoctorSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED']),
});

import { z } from 'zod';

const ratingScale = z.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  appointmentId: z.string().uuid(),
  ratingOverall: ratingScale,
  ratingDoctor: ratingScale,
  ratingStaff: ratingScale.optional(),
  ratingWaitTime: ratingScale.optional(),
  ratingClinic: ratingScale.optional(),
  comment: z.string().max(1000).optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

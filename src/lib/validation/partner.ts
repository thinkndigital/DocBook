import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

/**
 * A clinic or hospital asking to join.
 *
 * Every field is bounded. This is an unauthenticated write, so the only thing standing
 * between a text box on the public internet and the database is this schema — an unbounded
 * `notes` field is a cheap way to fill a table.
 */
export const submitPartnerApplicationSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  type: z.enum(['CLINIC', 'HOSPITAL']),
  countryId: z.string().uuid(),
  cityId: z.string().uuid().optional(),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: emailSchema,
  contactPhone: z.string().trim().min(6).max(32),
  doctorCount: z.coerce.number().int().min(0).max(10_000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const reviewPartnerApplicationSchema = z.object({
  status: z.enum(['PENDING', 'CONTACTED', 'APPROVED', 'REJECTED']),
  reviewNotes: z.string().trim().max(2000).optional(),
});

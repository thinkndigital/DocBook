import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

const openingHoursSchema = z.record(
  z.array(z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }))
);

export const createBranchSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(2).max(300),
  cityId: z.string().uuid(),
  phone: z.string().max(30).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openingHours: openingHoursSchema.default({}),
  parkingInfo: z.string().max(300).optional(),
  accessibility: z.string().max(300).optional(),
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createDoctorSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200).optional(),
  // If given, this becomes the account's real password (mustChangePassword is not set) —
  // the creator is expected to hand it to the doctor directly. Left blank, the account
  // gets DEFAULT_ASSIGNED_PASSWORD and is locked to the change-password screen until the
  // doctor sets their own. See src/lib/services/account-provisioning.ts.
  initialPassword: z.string().min(1).max(200).optional(),
  specialtyId: z.string().uuid(),
  licenseNumber: z.string().min(2).max(100),
  yearsExperience: z.number().int().min(0).max(70).default(0),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  languages: z.array(z.string().min(2).max(30)).default([]),
  consultationPriceMinor: z.number().int().min(0),
  bio: z.string().max(2000).optional(),
  bioAr: z.string().max(2000).optional(),
  branchIds: z.array(z.string().uuid()).min(1),
});

export const updateDoctorSchema = z.object({
  specialtyId: z.string().uuid().optional(),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  languages: z.array(z.string().min(2).max(30)).optional(),
  consultationPriceMinor: z.number().int().min(0).optional(),
  bio: z.string().max(2000).optional(),
  bioAr: z.string().max(2000).optional(),
  branchIds: z.array(z.string().uuid()).min(1).optional(),
});

export const createStaffSchema = z.object({
  email: emailSchema,
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200).optional(),
  branchId: z.string().uuid().optional(),
  title: z.string().max(100).optional(),
  // See createDoctorSchema — same rule, same reasoning.
  initialPassword: z.string().min(1).max(200).optional(),
});

export const createServiceSchema = z.object({
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200),
  specialtyId: z.string().uuid().optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).toUpperCase().default('JOD'),
  durationMinutes: z.number().int().min(5).max(480),
  type: z.enum(['IN_PERSON', 'VIDEO', 'FOLLOW_UP', 'EMERGENCY', 'HOME_VISIT']).default('IN_PERSON'),
});

export const updateServiceSchema = createServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});

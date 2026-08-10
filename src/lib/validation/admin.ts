import { z } from 'zod';

export const createTenantSchema = z.object({
  type: z.enum([
    'INDEPENDENT_DOCTOR',
    'CLINIC',
    'MEDICAL_CENTER',
    'HOSPITAL',
    'PHARMACY',
    'LABORATORY',
    'HEALTHCARE_GROUP',
    'CORPORATE',
    'INSURANCE_COMPANY',
  ]),
  name: z.string().min(2).max(200),
  nameAr: z.string().min(2).max(200),
  countryId: z.string().uuid(),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).max(200),
  adminNameAr: z.string().min(2).max(200).optional(),
});

export const tenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REJECTED']),
  reason: z.string().max(500).optional(),
});

export const createCountrySchema = z.object({
  code: z.string().length(2).toUpperCase(),
  name: z.string().min(2).max(100),
  nameAr: z.string().min(2).max(100),
  currency: z.string().length(3).toUpperCase(),
  phonePrefix: z.string().regex(/^\+\d{1,4}$/),
  timezone: z.string().min(2).max(100),
  languages: z.array(z.string().min(2).max(5)).min(1),
  taxRules: z.record(z.unknown()).optional(),
});

export const updateCountrySchema = createCountrySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createCitySchema = z.object({
  name: z.string().min(1).max(100),
  nameAr: z.string().min(1).max(100),
});

export const createPlanSchema = z.object({
  tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  name: z.string().min(2).max(100),
  priceMonthlyMinor: z.number().int().min(0),
  currency: z.string().length(3).toUpperCase().default('JOD'),
  bookingCommissionPct: z.number().min(0).max(100).default(0),
  maxBranches: z.number().int().min(1).nullable().optional(),
  maxDoctors: z.number().int().min(1).nullable().optional(),
  apiAccess: z.boolean().default(false),
  whiteLabel: z.boolean().default(false),
  features: z.record(z.unknown()).default({}),
});

export const updatePlanSchema = createPlanSchema.partial().extend({
  isActive: z.boolean().optional(),
});

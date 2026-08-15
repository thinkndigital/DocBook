import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

/**
 * A clinic/hospital registering itself (no admin approval in the loop — see
 * `selfRegisterTenant` in src/lib/services/tenants.ts). `type` excludes
 * INDEPENDENT_DOCTOR/PHARMACY/LABORATORY on purpose: those either come from the doctor
 * self-registration path (INDEPENDENT_DOCTOR) or aren't offered as a public self-signup
 * option in this pass.
 */
export const selfRegisterTenantSchema = z.object({
  type: z.enum(['CLINIC', 'MEDICAL_CENTER', 'HOSPITAL']),
  name: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  countryId: z.string().uuid(),
  adminName: z.string().trim().min(2).max(200),
  adminNameAr: z.string().trim().min(2).max(200).optional(),
  adminEmail: emailSchema,
  password: z.string().min(8).max(200),
  branchName: z.string().trim().min(2).max(200),
  branchAddress: z.string().trim().min(2).max(300),
  cityId: z.string().uuid(),
  branchPhone: z.string().trim().max(30).optional(),
});

const newClinicSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  countryId: z.string().uuid(),
  branchName: z.string().trim().min(2).max(200),
  branchAddress: z.string().trim().min(2).max(300),
  cityId: z.string().uuid(),
  branchPhone: z.string().trim().max(30).optional(),
});

/**
 * A doctor registering themselves — either joining a real clinic by invite code
 * (`inviteCode` + `branchId`) or standing up their own solo practice (`newClinic`).
 * Exactly one of the two must be present; enforced below rather than with a discriminated
 * union so the client can send one flat object regardless of which tab the user picked.
 */
export const selfRegisterDoctorSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8).max(200),
    name: z.string().trim().min(2).max(200),
    nameAr: z.string().trim().min(2).max(200).optional(),
    specialtyId: z.string().uuid(),
    licenseNumber: z.string().trim().min(2).max(100),
    yearsExperience: z.number().int().min(0).max(70).default(0),
    gender: z.enum(['MALE', 'FEMALE']).optional(),
    languages: z.array(z.string().min(2).max(30)).default([]),
    consultationPriceMinor: z.number().int().min(0),
    bio: z.string().max(2000).optional(),
    bioAr: z.string().max(2000).optional(),
    inviteCode: z.string().trim().length(8).optional(),
    branchId: z.string().uuid().optional(),
    newClinic: newClinicSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const hasInvite = !!val.inviteCode;
    const hasNewClinic = !!val.newClinic;
    if (hasInvite === hasNewClinic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either an invite code or a new clinic — not both, not neither.',
        path: ['inviteCode'],
      });
      return;
    }
    if (hasInvite && !val.branchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'branchId is required when joining via invite code.',
        path: ['branchId'],
      });
    }
  });

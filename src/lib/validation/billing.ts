import { z } from 'zod';

export const collectPaymentSchema = z.object({
  method: z.enum(['CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'BANK_TRANSFER', 'CASH', 'INSURANCE', 'CORPORATE_BILLING']),
  amountMinor: z.number().int().min(1).optional(),
});

export const refundPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amountMinor: z.number().int().min(1).optional(),
});

export const confirmRedirectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});

export const subscribeSchema = z.object({
  planId: z.string().uuid(),
});

export const commissionRuleSchema = z
  .object({
    id: z.string().uuid().optional(),
    tenantId: z.string().uuid().nullable().optional(),
    entityType: z.enum(['DOCTOR', 'CLINIC', 'REPRESENTATIVE', 'PLATFORM']),
    percentage: z.number().min(0).max(100).nullable().optional(),
    flatAmountMinor: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.percentage != null || v.flatAmountMinor != null, {
    message: 'Provide either a percentage or a flat amount.',
  });

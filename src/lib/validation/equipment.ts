import { z } from 'zod';
import { emailSchema } from '@/lib/validation/common';

export const selfRegisterSupplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  countryId: z.string().uuid(),
  contactName: z.string().trim().min(2).max(200),
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(200),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(200),
  nameAr: z.string().trim().min(2).max(200),
  description: z.string().max(4000).optional(),
  descriptionAr: z.string().max(4000).optional(),
  category: z.string().trim().min(2).max(100),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).toUpperCase().default('JOD'),
  stockQty: z.number().int().min(0).default(0),
  imageUrl: z.string().url().max(1000).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const createEquipmentOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10_000) }))
    .min(1)
    .max(50),
  shippingAddress: z.string().trim().min(4).max(300),
  notes: z.string().max(1000).optional(),
});

export const updateEquipmentOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
});

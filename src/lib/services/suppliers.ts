import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail } from '@/lib/validation/common';
import type { z } from 'zod';
import type { selfRegisterSupplierSchema } from '@/lib/validation/equipment';

export class SupplierConflictError extends Error {}

type SelfRegisterSupplierInput = z.infer<typeof selfRegisterSupplierSchema>;

/**
 * A manufacturer/distributor registering itself — same posture as `selfRegisterTenant` and
 * `selfRegisterDoctor`: instant, real account, own chosen password, no admin approval step.
 * Suppliers are tenant-less (like Representative/Patient — see schema comment on the
 * `Supplier` model), so there is no tenant/branch to create alongside it.
 */
export async function selfRegisterSupplier(input: SelfRegisterSupplierInput) {
  const email = normalizeEmail(input.email);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) throw new SupplierConflictError(`A user with email ${email} already exists.`);

  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'SUPPLIER',
        name: input.contactName,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    });
    const supplier = await tx.supplier.create({
      data: {
        userId: user.id,
        name: input.name,
        nameAr: input.nameAr,
        countryId: input.countryId,
        phone: input.phone,
      },
    });
    return { user, supplier };
  });

  await recordAudit({
    actorUserId: result.user.id,
    tenantId: null,
    action: 'SUPPLIER_SELF_REGISTERED',
    entityType: 'Supplier',
    entityId: result.supplier.id,
  });

  return result;
}

export async function getOwnSupplierProfile(userId: string) {
  return db.supplier.findUnique({ where: { userId } });
}

export class NoSupplierProfileError extends Error {}

/** Every /api/v1/supplier/* route needs this first — throws instead of returning null so callers don't forget the check. */
export async function requireOwnSupplier(userId: string) {
  const supplier = await getOwnSupplierProfile(userId);
  if (!supplier) throw new NoSupplierProfileError('No supplier profile for this account.');
  return supplier;
}

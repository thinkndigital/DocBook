import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_ASSIGNED_PASSWORD } from '@/lib/constants';
import bcrypt from 'bcryptjs';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createStaffSchema } from '@/lib/validation/tenant';
import { normalizeEmail } from '@/lib/validation/common';

type CreateStaffInput = z.infer<typeof createStaffSchema>;

export class StaffConflictError extends Error {}
export class InvalidBranchError extends Error {}

export async function listStaff() {
  return db.staff.findMany({
    include: { user: { select: { id: true, name: true, email: true, status: true } }, branch: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createStaff(input: CreateStaffInput, actor: SessionUser & { tenantId: string }) {
  const email = normalizeEmail(input.email);
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) throw new StaffConflictError(`A user with email ${email} already exists.`);

  if (input.branchId) {
    const branch = await db.branch.findFirst({ where: { id: input.branchId } });
    if (!branch) throw new InvalidBranchError('Branch does not exist or does not belong to this tenant.');
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ASSIGNED_PASSWORD, 12);

  const staff = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: actor.tenantId,
        email,
        passwordHash,
        role: 'RECEPTIONIST',
        name: input.name,
        nameAr: input.nameAr,
        status: 'ACTIVE',
        // Created on the shared assigned password; blocked from everything until changed.
        mustChangePassword: true,
      },
    });

    return tx.staff.create({
      data: { userId: user.id, tenantId: actor.tenantId, branchId: input.branchId, title: input.title },
      include: { user: { select: { id: true, name: true, email: true } }, branch: true },
    });
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'STAFF_CREATED',
    entityType: 'Staff',
    entityId: staff.id,
    afterState: { title: staff.title, branchId: staff.branchId },
  });

  return staff;
}

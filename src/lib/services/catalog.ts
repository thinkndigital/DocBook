import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { createServiceSchema, updateServiceSchema } from '@/lib/validation/tenant';

type CreateServiceInput = z.infer<typeof createServiceSchema>;
type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

/** Service-catalog (pricing/offerings) management — named catalog.ts to avoid colliding with this directory's own name. */
export async function listServices() {
  return db.service.findMany({ include: { specialty: true }, orderBy: { createdAt: 'desc' } });
}

export async function createService(input: CreateServiceInput, actor: SessionUser & { tenantId: string }) {
  const service = await db.service.create({ data: { ...input, tenantId: actor.tenantId } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'SERVICE_CREATED',
    entityType: 'Service',
    entityId: service.id,
    afterState: { name: service.name, priceMinor: service.priceMinor },
  });
  return service;
}

export async function updateService(id: string, input: UpdateServiceInput, actor: SessionUser & { tenantId: string }) {
  const before = await db.service.findFirst({ where: { id } });
  if (!before) return null;
  const service = await db.service.update({ where: { id }, data: input });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: actor.tenantId,
    action: 'SERVICE_UPDATED',
    entityType: 'Service',
    entityId: id,
    beforeState: { priceMinor: before.priceMinor, isActive: before.isActive },
    afterState: { priceMinor: service.priceMinor, isActive: service.isActive },
  });
  return service;
}

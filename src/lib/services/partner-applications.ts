import type { PartnerApplicationStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { normalizeEmail } from '@/lib/validation/common';
import type { SessionUser } from '@/lib/auth';

/**
 * Inbound "we'd like to join" enquiries from clinics and hospitals.
 *
 * The load-bearing decision is what approval does: **nothing automatic**. Marking an
 * application `APPROVED` records a human's decision and no more; the tenant is then created
 * through the existing `/admin/tenants` flow. Wiring approval to tenant creation would make
 * one click on a queue item mint a tenant, an admin user and an assigned password from data
 * an anonymous visitor typed — and the tenant table is what every isolation guarantee in
 * this system is keyed on. One creation path, and it stays behind an authenticated form.
 */

export interface SubmitPartnerApplicationInput {
  organizationName: string;
  type: 'CLINIC' | 'HOSPITAL';
  countryId: string;
  cityId?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  doctorCount?: number;
  notes?: string;
}

export class UnknownCountryError extends Error {}

export async function submitPartnerApplication(input: SubmitPartnerApplicationInput) {
  // Validate the foreign keys here rather than letting Postgres reject them: an unhandled
  // constraint violation surfaces as a 500 to a prospective customer, and Prisma echoes the
  // offending value into the error message on its way to the logs.
  const country = await db.country.findFirst({ where: { id: input.countryId, isActive: true } });
  if (!country) throw new UnknownCountryError('Unknown country.');

  if (input.cityId) {
    const city = await db.city.findFirst({
      where: { id: input.cityId, countryId: country.id, isActive: true },
    });
    // A city that doesn't belong to the chosen country is a stale form, not an attack.
    // Dropping it keeps the enquiry rather than refusing it over a detail staff can fix.
    if (!city) input = { ...input, cityId: undefined };
  }

  const application = await db.partnerApplication.create({
    data: {
      organizationName: input.organizationName,
      type: input.type,
      countryId: input.countryId,
      cityId: input.cityId ?? null,
      contactName: input.contactName,
      contactEmail: normalizeEmail(input.contactEmail),
      contactPhone: input.contactPhone,
      doctorCount: input.doctorCount ?? null,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });

  // No actorUserId: the submitter is anonymous by design. The row itself holds the contact
  // details, so the audit entry deliberately carries none of them.
  await recordAudit({
    action: 'PARTNER_APPLICATION_SUBMITTED',
    entityType: 'PartnerApplication',
    entityId: application.id,
  });

  return application;
}

export async function listPartnerApplications(params: { status?: PartnerApplicationStatus }) {
  const where: Prisma.PartnerApplicationWhereInput = params.status ? { status: params.status } : {};
  return db.partnerApplication.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: { country: true, city: true },
    take: 200,
  });
}

export async function setPartnerApplicationStatus(
  id: string,
  status: PartnerApplicationStatus,
  actor: SessionUser,
  reviewNotes?: string
) {
  const updated = await db.partnerApplication.update({
    where: { id },
    data: {
      status,
      reviewNotes: reviewNotes ?? null,
      reviewedByUserId: actor.id,
      reviewedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: 'PARTNER_APPLICATION_REVIEWED',
    entityType: 'PartnerApplication',
    entityId: id,
    // Status only. The reviewer's note can contain anything they typed, and audit rows are
    // append-only and widely readable by admins — see SECURITY.md.
    afterState: { status: updated.status },
  });

  return updated;
}

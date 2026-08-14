import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * Public marketplace reads — no auth, no tenant scoping. Only ever returns doctors that
 * are `verified: true` at a tenant with `status: 'ACTIVE'` (the verified badge from Phase
 * 3's admin queue and the tenant-verification from Phase 2 both gate real-world
 * visibility here, not just internal dashboards) and not soft-deleted.
 */
const PUBLIC_DOCTOR_WHERE_BASE: Prisma.DoctorWhereInput = {
  verified: true,
  deletedAt: null,
  tenant: { status: 'ACTIVE' },
};

/**
 * Explicit field list for anything served to the public.
 *
 * This was an `include`, which returns every scalar column on `Doctor` — and since Phase 9
 * that has included `calendarFeedToken`, the bearer credential for a doctor's private iCal
 * feed. Anyone hitting `/api/v1/public/doctors` could read it and subscribe to that
 * doctor's full appointment calendar without authenticating. It only ever returned null in
 * practice because no seeded doctor had generated a feed yet, which is exactly why it
 * survived review.
 *
 * A `select` is now the rule here rather than a preference: with `include`, every column
 * added to `Doctor` in future is published to the internet by default, and the next
 * credential-shaped column repeats this. With `select`, a new field is private until
 * somebody deliberately lists it.
 */
const PUBLIC_DOCTOR_SELECT = {
  id: true,
  tenantId: true,
  specialtyId: true,
  subSpecialty: true,
  yearsExperience: true,
  bio: true,
  bioAr: true,
  gender: true,
  languages: true,
  verified: true,
  consultationPriceMinor: true,
  currency: true,
  ratingAverage: true,
  ratingCount: true,
  // Deliberately omitted: calendarFeedToken (a credential), licenseNumber (identity
  // document number — the `verified` badge is what a patient needs, not the number itself),
  // userId, verificationStatus, and the timestamp/soft-delete columns.
  user: { select: { name: true, nameAr: true } },
  specialty: true,
  tenant: { select: { id: true, name: true, nameAr: true, type: true } },
  branches: { include: { branch: { include: { city: true } } } },
} as const;

export interface DoctorSearchFilters {
  specialtySlug?: string;
  cityId?: string;
  gender?: 'MALE' | 'FEMALE';
  query?: string;
  cursor?: string;
  limit: number;
}

export async function searchDoctors(filters: DoctorSearchFilters) {
  const where: Prisma.DoctorWhereInput = { ...PUBLIC_DOCTOR_WHERE_BASE };

  if (filters.specialtySlug) where.specialty = { slug: filters.specialtySlug };
  if (filters.gender) where.gender = filters.gender;
  if (filters.cityId) where.branches = { some: { branch: { cityId: filters.cityId } } };
  if (filters.query) {
    where.OR = [
      { user: { name: { contains: filters.query, mode: 'insensitive' } } },
      { user: { nameAr: { contains: filters.query, mode: 'insensitive' } } },
      { specialty: { name: { contains: filters.query, mode: 'insensitive' } } },
      { specialty: { nameAr: { contains: filters.query, mode: 'insensitive' } } },
    ];
  }

  const items = await db.doctor.findMany({
    where,
    select: PUBLIC_DOCTOR_SELECT,
    orderBy: [{ ratingAverage: 'desc' }, { createdAt: 'desc' }],
    take: filters.limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > filters.limit;
  const page = hasMore ? items.slice(0, filters.limit) : items;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? last.id : null };
}

export async function getPublicDoctor(id: string) {
  return db.doctor.findFirst({ where: { id, ...PUBLIC_DOCTOR_WHERE_BASE }, select: PUBLIC_DOCTOR_SELECT });
}

/**
 * Everything the sitemap may list.
 *
 * Shares `PUBLIC_DOCTOR_WHERE_BASE` with the profile page's own query rather than
 * re-stating the conditions, so the two cannot drift: a sitemap that lists a doctor whose
 * profile 404s (unverified, soft-deleted, or belonging to a suspended clinic) trains a
 * crawler to distrust the whole file.
 *
 * `select` is deliberately narrow — a sitemap needs an id and a timestamp, and nothing
 * here should be one careless `include` away from publishing a column.
 */
export async function listIndexableDoctors() {
  return db.doctor.findMany({
    where: PUBLIC_DOCTOR_WHERE_BASE,
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listPublicSpecialties() {
  return db.specialty.findMany({ orderBy: { name: 'asc' } });
}

export async function listPublicCities() {
  return db.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include: { country: true } });
}

/**
 * Services aren't linked to a specific doctor in the schema (they belong to the tenant) —
 * for the patient booking widget, offer the doctor's own specialty's services first, and
 * fall back to the tenant's full active catalog if none match specifically.
 */
export async function listDoctorBookableServices(doctorId: string) {
  const doctor = await db.doctor.findUnique({ where: { id: doctorId }, select: { tenantId: true, specialtyId: true } });
  if (!doctor) return [];

  const bySpecialty = await db.service.findMany({
    where: { tenantId: doctor.tenantId, specialtyId: doctor.specialtyId, isActive: true },
  });
  if (bySpecialty.length > 0) return bySpecialty;

  return db.service.findMany({ where: { tenantId: doctor.tenantId, isActive: true } });
}

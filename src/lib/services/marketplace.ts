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

const PUBLIC_DOCTOR_INCLUDE = {
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
    include: PUBLIC_DOCTOR_INCLUDE,
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
  return db.doctor.findFirst({ where: { id, ...PUBLIC_DOCTOR_WHERE_BASE }, include: PUBLIC_DOCTOR_INCLUDE });
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

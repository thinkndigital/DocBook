import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { createCountrySchema, updateCountrySchema, createCitySchema } from '@/lib/validation/admin';

type CreateCountryInput = z.infer<typeof createCountrySchema>;
type UpdateCountryInput = z.infer<typeof updateCountrySchema>;
type CreateCityInput = z.infer<typeof createCitySchema>;

export async function listCountries() {
  return db.country.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { cities: true, tenants: true } } } });
}

export async function createCountry(input: CreateCountryInput, actor: SessionUser) {
  const country = await db.country.create({
    data: { ...input, taxRules: (input.taxRules as Prisma.InputJsonValue) ?? undefined },
  });
  await recordAudit({
    actorUserId: actor.id,
    action: 'COUNTRY_CREATED',
    entityType: 'Country',
    entityId: country.id,
    afterState: { code: country.code, name: country.name },
  });
  return country;
}

export async function updateCountry(id: string, input: UpdateCountryInput, actor: SessionUser) {
  const before = await db.country.findUnique({ where: { id } });
  if (!before) return null;
  const country = await db.country.update({
    where: { id },
    data: { ...input, taxRules: (input.taxRules as Prisma.InputJsonValue) ?? undefined },
  });
  await recordAudit({
    actorUserId: actor.id,
    action: 'COUNTRY_UPDATED',
    entityType: 'Country',
    entityId: id,
    beforeState: before,
    afterState: country,
  });
  return country;
}

export async function listCities(countryId: string) {
  return db.city.findMany({ where: { countryId }, orderBy: { name: 'asc' } });
}

export async function createCity(countryId: string, input: CreateCityInput, actor: SessionUser) {
  const city = await db.city.create({ data: { ...input, countryId } });
  await recordAudit({
    actorUserId: actor.id,
    action: 'CITY_CREATED',
    entityType: 'City',
    entityId: city.id,
    afterState: { name: city.name, countryId },
  });
  return city;
}

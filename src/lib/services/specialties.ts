import { db } from '@/lib/db';

/** Global reference data, not tenant-scoped — every tenant picks from the same list. */
export async function listSpecialties() {
  return db.specialty.findMany({ orderBy: { name: 'asc' } });
}

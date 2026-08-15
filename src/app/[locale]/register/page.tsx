import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { listPublicCities, listPublicSpecialties } from '@/lib/services/marketplace';
import { db } from '@/lib/db';
import { RegisterForm } from './register-form';

/** Reference data only (countries/cities/specialties) — same cache posture as /for-clinics. */
export const revalidate = 3600;

export default async function RegisterPage({ params }: { params: { locale: Locale } }) {
  const dict = getDictionary(params.locale);

  // Unreachable during `next build` by design — same posture as /for-clinics: the form
  // still renders and the selects fill in on the first revalidation after deploy.
  let countries: Array<{ id: string; name: string; nameAr: string }> = [];
  let cities: Awaited<ReturnType<typeof listPublicCities>> = [];
  let specialties: Awaited<ReturnType<typeof listPublicSpecialties>> = [];
  try {
    [countries, cities, specialties] = await Promise.all([
      db.country.findMany({ where: { isActive: true }, select: { id: true, name: true, nameAr: true } }),
      listPublicCities(),
      listPublicSpecialties(),
    ]);
  } catch {
    /* form-only render */
  }

  return (
    <RegisterForm
      locale={params.locale}
      dict={dict}
      countries={countries}
      cities={cities.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, countryId: c.countryId }))}
      specialties={specialties.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr }))}
    />
  );
}

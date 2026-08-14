import type { PrismaClient } from '@prisma/client';
import { SubscriptionTier } from '@prisma/client';

/**
 * Reference data: the rows the platform needs to function at all, on any environment,
 * including production.
 *
 * This is deliberately separate from `seed.ts`. Everything here describes the world the
 * product operates in — a country's currency and tax rules, the cities it serves, the
 * specialties doctors can hold, the plans a clinic can subscribe to. None of it is sample
 * content and none of it carries a credential, so it is safe to apply to a database that
 * holds real patient records.
 *
 * `seed.ts` calls this first and then adds demo tenants, doctors and login accounts with a
 * well-known password. That half must never run against production, which is precisely why
 * the two are not the same file.
 *
 * Every write is idempotent. Re-running adds nothing and changes nothing, so this can be
 * re-applied after adding a specialty or a city without special-casing the first run.
 */

const JORDAN_CITIES = [
  { name: 'Amman', nameAr: 'عمان' },
  { name: 'Irbid', nameAr: 'إربد' },
  { name: 'Zarqa', nameAr: 'الزرقاء' },
  { name: 'Aqaba', nameAr: 'العقبة' },
  { name: 'Salt', nameAr: 'السلط' },
  { name: 'Madaba', nameAr: 'مادبا' },
];

const SPECIALTIES = [
  { slug: 'general-practice', name: 'General Practice', nameAr: 'طب عام' },
  { slug: 'dentistry', name: 'Dentistry', nameAr: 'طب الأسنان' },
  { slug: 'dermatology', name: 'Dermatology', nameAr: 'الجلدية' },
  { slug: 'pediatrics', name: 'Pediatrics', nameAr: 'طب الأطفال' },
  { slug: 'cardiology', name: 'Cardiology', nameAr: 'أمراض القلب' },
  { slug: 'obstetrics-gynecology', name: 'Obstetrics & Gynecology', nameAr: 'نسائية وتوليد' },
  { slug: 'orthopedics', name: 'Orthopedics', nameAr: 'العظام' },
  { slug: 'psychiatry', name: 'Psychiatry', nameAr: 'الطب النفسي' },
];

const PLANS = [
  {
    tier: SubscriptionTier.FREE,
    name: 'Free',
    priceMonthlyMinor: 0,
    bookingCommissionPct: 15,
    maxBranches: 1,
    maxDoctors: 1,
    apiAccess: false,
    whiteLabel: false,
    features: { basicProfile: true, reminders: false, analytics: false },
  },
  {
    tier: SubscriptionTier.PRO,
    name: 'Pro',
    priceMonthlyMinor: 4900,
    bookingCommissionPct: 0,
    maxBranches: 3,
    maxDoctors: 10,
    apiAccess: false,
    whiteLabel: false,
    features: { unlimitedBookings: true, reminders: true, analytics: true, priorityListing: true },
  },
  {
    tier: SubscriptionTier.ENTERPRISE,
    name: 'Enterprise',
    priceMonthlyMinor: 19900,
    bookingCommissionPct: 0,
    maxBranches: null,
    maxDoctors: null,
    apiAccess: true,
    whiteLabel: true,
    features: { representatives: true, advancedAnalytics: true, dedicatedSupport: true },
  },
];

export async function seedReferenceData(prisma: PrismaClient) {
  const jordan = await prisma.country.upsert({
    where: { code: 'JO' },
    update: {},
    create: {
      code: 'JO',
      name: 'Jordan',
      nameAr: 'الأردن',
      currency: 'JOD',
      phonePrefix: '+962',
      timezone: 'Asia/Amman',
      languages: ['ar', 'en'],
      taxRules: { vatPercent: 16 },
    },
  });

  const cities = await Promise.all(
    JORDAN_CITIES.map((c) =>
      prisma.city.upsert({
        where: { countryId_name: { countryId: jordan.id, name: c.name } },
        update: {},
        create: { countryId: jordan.id, name: c.name, nameAr: c.nameAr },
      })
    )
  );

  const specialties = await Promise.all(
    SPECIALTIES.map((s) =>
      prisma.specialty.upsert({ where: { slug: s.slug }, update: {}, create: s })
    )
  );

  // SubscriptionPlan has no unique column to upsert on (`tier` is not unique — the schema
  // allows several plans per tier, e.g. a grandfathered price). Guard on tier + name so a
  // second run is a no-op rather than a duplicate set of plans that quietly changes which
  // commission percentage a new tenant picks up.
  const plans = [];
  for (const plan of PLANS) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { tier: plan.tier, name: plan.name },
    });
    plans.push(existing ?? (await prisma.subscriptionPlan.create({ data: plan })));
  }

  const [firstCity] = cities;
  const [firstSpecialty] = specialties;
  if (!firstCity || !firstSpecialty) {
    throw new Error('Reference data lists (cities/specialties) must not be empty.');
  }

  return { country: jordan, cities, specialties, plans, firstCity, firstSpecialty };
}

/** Run directly: `tsx prisma/reference-data.ts` — used by the bootstrap workflow. */
if (require.main === module) {
  (async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    const prisma = new Client();
    try {
      const { cities, specialties, plans } = await seedReferenceData(prisma);
      console.log(
        `Reference data applied: 1 country, ${cities.length} cities, ` +
          `${specialties.length} specialties, ${plans.length} plans.`
      );
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

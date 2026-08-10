import { PrismaClient, TenantType, TenantStatus, UserRole, SubscriptionTier } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

const DEFAULT_PASSWORD = 'DocBook@2026';

async function main() {
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
      prisma.specialty.upsert({
        where: { slug: s.slug },
        update: {},
        create: s,
      })
    )
  );

  const [ammanCity] = cities;
  const [generalPractice] = specialties;
  if (!ammanCity || !generalPractice) {
    throw new Error('Seed data lists (cities/specialties) must not be empty.');
  }

  const plans = await Promise.all([
    prisma.subscriptionPlan.create({
      data: {
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
    }),
    prisma.subscriptionPlan.create({
      data: {
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
    }),
    prisma.subscriptionPlan.create({
      data: {
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
    }),
  ]);

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@docbook.dev' },
    update: {},
    create: {
      email: 'admin@docbook.dev',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      name: 'Platform Admin',
      nameAr: 'مسؤول المنصة',
      status: 'ACTIVE',
    },
  });

  const clinicTenant = await prisma.tenant.create({
    data: {
      type: TenantType.CLINIC,
      name: 'Amman Family Clinic',
      nameAr: 'عيادة عمّان العائلية',
      countryId: jordan.id,
      status: TenantStatus.ACTIVE,
      subscriptions: {
        create: {
          planId: plans[1].id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: clinicTenant.id,
      name: 'Main Branch — Abdoun',
      address: 'Abdoun, Amman',
      cityId: ammanCity.id,
      openingHours: {
        sun: [{ start: '09:00', end: '17:00' }],
        mon: [{ start: '09:00', end: '17:00' }],
        tue: [{ start: '09:00', end: '17:00' }],
        wed: [{ start: '09:00', end: '17:00' }],
        thu: [{ start: '09:00', end: '17:00' }],
      },
    },
  });

  const doctorUser = await prisma.user.create({
    data: {
      tenantId: clinicTenant.id,
      email: 'dr.laila@docbook.dev',
      passwordHash,
      role: UserRole.DOCTOR,
      name: 'Dr. Laila Haddad',
      nameAr: 'د. ليلى حداد',
      status: 'ACTIVE',
    },
  });

  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      tenantId: clinicTenant.id,
      specialtyId: generalPractice.id,
      licenseNumber: 'JO-MED-10234',
      yearsExperience: 9,
      bio: 'General practitioner focused on family medicine.',
      bioAr: 'طبيبة عامة متخصصة في طب الأسرة.',
      gender: 'FEMALE',
      languages: ['ar', 'en'],
      verified: true,
      verificationStatus: 'VERIFIED',
      consultationPriceMinor: 2000,
      branches: { create: { branchId: branch.id } },
      schedules: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 20,
          bufferMinutes: 5,
        })),
      },
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      email: 'patient@docbook.dev',
      passwordHash,
      role: UserRole.PATIENT,
      name: 'Sample Patient',
      nameAr: 'مريض تجريبي',
      status: 'ACTIVE',
    },
  });

  await prisma.patient.create({
    data: {
      userId: patientUser.id,
      gender: 'MALE',
      allergies: [],
    },
  });

  console.log('Seed complete.');
  console.log(`Super admin: admin@docbook.dev / ${DEFAULT_PASSWORD}`);
  console.log(`Doctor:      dr.laila@docbook.dev / ${DEFAULT_PASSWORD}`);
  console.log(`Patient:     patient@docbook.dev / ${DEFAULT_PASSWORD}`);
  console.log(`Tenant: ${clinicTenant.name} (${clinicTenant.id}), Doctor: ${doctor.id}, Super admin: ${superAdmin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

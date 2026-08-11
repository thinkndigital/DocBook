import { PrismaClient, TenantType, TenantStatus, UserRole, SubscriptionTier } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_ASSIGNED_PASSWORD } from '../src/lib/constants';

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

const DEFAULT_PASSWORD = DEFAULT_ASSIGNED_PASSWORD;

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

  /**
   * Additional verified doctors across distinct specialties.
   *
   * Not decoration: the Phase 10 symptom checker maps a description to a specialty and
   * then resolves real doctors from the marketplace query. With a single general-practice
   * doctor seeded, every triage result looks identical and the feature is impossible to
   * evaluate — a dental complaint would correctly pick Dentistry and then show an empty
   * shortlist. These give each of the common triage paths something real to land on.
   */
  const extraDoctors = [
    {
      email: 'dr.omar@docbook.dev',
      name: 'Dr. Omar Nassar',
      nameAr: 'د. عمر نصار',
      slug: 'dentistry',
      license: 'JO-DEN-20117',
      years: 12,
      gender: 'MALE' as const,
      priceMinor: 2500,
      bio: 'Dentist with a focus on restorative and emergency dental care.',
      bioAr: 'طبيب أسنان متخصص في الترميم وحالات الأسنان الطارئة.',
    },
    {
      email: 'dr.rana@docbook.dev',
      name: 'Dr. Rana Khalil',
      nameAr: 'د. رنا خليل',
      slug: 'dermatology',
      license: 'JO-DER-30442',
      years: 7,
      gender: 'FEMALE' as const,
      priceMinor: 3000,
      bio: 'Dermatologist treating acne, eczema, and hair loss.',
      bioAr: 'طبيبة جلدية تعالج حب الشباب والإكزيما وتساقط الشعر.',
    },
    {
      email: 'dr.samir@docbook.dev',
      name: 'Dr. Samir Odeh',
      nameAr: 'د. سمير عودة',
      slug: 'cardiology',
      license: 'JO-CAR-40988',
      years: 18,
      gender: 'MALE' as const,
      priceMinor: 4500,
      bio: 'Cardiologist managing hypertension and arrhythmia follow-up.',
      bioAr: 'طبيب قلب يتابع ارتفاع ضغط الدم واضطراب نظم القلب.',
    },
  ];

  for (const entry of extraDoctors) {
    const specialty = specialties.find((s) => s.slug === entry.slug);
    if (!specialty) continue;

    const user = await prisma.user.create({
      data: {
        tenantId: clinicTenant.id,
        email: entry.email,
        passwordHash,
        role: UserRole.DOCTOR,
        name: entry.name,
        nameAr: entry.nameAr,
        status: 'ACTIVE',
      },
    });

    await prisma.doctor.create({
      data: {
        userId: user.id,
        tenantId: clinicTenant.id,
        specialtyId: specialty.id,
        licenseNumber: entry.license,
        yearsExperience: entry.years,
        bio: entry.bio,
        bioAr: entry.bioAr,
        gender: entry.gender,
        languages: ['ar', 'en'],
        verified: true,
        verificationStatus: 'VERIFIED',
        consultationPriceMinor: entry.priceMinor,
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
  }

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

/**
 * Real, working demo accounts — one per role — for trying the product on a real
 * deployment, and a matching cleanup that removes every trace of them.
 *
 *   DEMO_ACTION=seed    DEMO_PASSWORD=... tsx scripts/demo-data.ts
 *   DEMO_ACTION=cleanup                   tsx scripts/demo-data.ts
 *
 * Why this exists instead of `prisma db seed`: that script is explicitly forbidden against
 * a real deployment (see bootstrap.yml) because it writes accounts under
 * `DEFAULT_ASSIGNED_PASSWORD`, a password committed to this repository, into a database
 * that may hold real patient records. This script is the same idea done safely —
 *
 *   - The password is never stored anywhere. It's a `DEMO_PASSWORD` the caller supplies at
 *     run time (a `workflow_dispatch` input, same trust model as `bootstrap.yml`'s
 *     `promote_email` — visible only to repo collaborators triggering the run), hashed and
 *     written like any real password. Nothing here has an equivalent of
 *     `DEFAULT_ASSIGNED_PASSWORD`.
 *   - Every row this creates is tagged and findable: every demo user's email ends in
 *     `@docbook-demo.test` (the `.test` TLD is IANA-reserved and never resolves — nobody
 *     can be emailed at these addresses even by mistake), and the tenant/doctor are left at
 *     their normal unreviewed defaults (`PENDING_VERIFICATION` / unverified) so they never
 *     surface in public search or the home page — a real visitor cannot stumble onto the
 *     demo doctor and book a real appointment against it, and login is never gated on
 *     verification (only SUSPENDED tenants block sign-in), so every demo account still
 *     works immediately.
 *   - `cleanup` reverses `seed` completely, including anything created *while testing*
 *     (appointments, records, orders) — not just the originally seeded rows — because the
 *     whole point is "try it, then remove every trace," not "remove what I remember
 *     creating."
 */
import { PrismaClient, TenantType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_DOMAIN = '@docbook-demo.test';
const EMAILS = {
  clinicAdmin: `demo.clinic${DEMO_DOMAIN}`,
  reception: `demo.reception${DEMO_DOMAIN}`,
  doctor: `demo.doctor${DEMO_DOMAIN}`,
  patient: `demo.patient${DEMO_DOMAIN}`,
  rep: `demo.rep${DEMO_DOMAIN}`,
  supplier: `demo.supplier${DEMO_DOMAIN}`,
};

async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Set DEMO_PASSWORD (8+ characters) to seed demo accounts.');
  }

  const existing = await prisma.user.findFirst({ where: { email: EMAILS.clinicAdmin } });
  if (existing) {
    throw new Error(`${EMAILS.clinicAdmin} already exists — run with DEMO_ACTION=cleanup first if you want to reseed.`);
  }

  const country = await prisma.country.findUnique({ where: { code: 'JO' } });
  if (!country) throw new Error('No Jordan reference row — run the reference-data bootstrap first.');
  const city = await prisma.city.findFirst({ where: { countryId: country.id, name: 'Amman' } });
  if (!city) throw new Error('No Amman reference row — run the reference-data bootstrap first.');
  const specialty = await prisma.specialty.findUnique({ where: { slug: 'general-practice' } });
  if (!specialty) throw new Error('No general-practice specialty — run the reference-data bootstrap first.');

  const passwordHash = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({
    data: {
      type: TenantType.CLINIC,
      name: 'DocBook Demo Clinic',
      nameAr: 'عيادة DocBook التجريبية',
      countryId: country.id,
      // Left at the normal unreviewed default on purpose — see file header.
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Demo Branch',
      address: 'Demo Street, Amman',
      cityId: city.id,
      openingHours: {},
    },
  });

  const clinicAdminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: EMAILS.clinicAdmin,
      passwordHash,
      role: 'TENANT_ADMIN',
      name: 'Demo Clinic Admin',
      nameAr: 'مدير العيادة التجريبية',
      status: 'ACTIVE',
    },
  });

  const receptionUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: EMAILS.reception,
      passwordHash,
      role: 'RECEPTIONIST',
      name: 'Demo Receptionist',
      nameAr: 'موظف استقبال تجريبي',
      status: 'ACTIVE',
    },
  });
  await prisma.staff.create({ data: { userId: receptionUser.id, tenantId: tenant.id, branchId: branch.id } });

  const doctorUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: EMAILS.doctor,
      passwordHash,
      role: 'DOCTOR',
      name: 'Demo Doctor',
      nameAr: 'طبيب تجريبي',
      status: 'ACTIVE',
    },
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      tenantId: tenant.id,
      specialtyId: specialty.id,
      licenseNumber: 'DEMO-0001',
      yearsExperience: 5,
      consultationPriceMinor: 2000,
      languages: ['ar', 'en'],
      branches: { create: [{ branchId: branch.id }] },
      schedules: {
        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 20,
        })),
      },
    },
  });

  await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: 'General Checkup (Demo)',
      nameAr: 'كشف عام (تجريبي)',
      specialtyId: specialty.id,
      priceMinor: 2000,
      durationMinutes: 20,
      type: 'IN_PERSON',
    },
  });
  const videoService = await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: 'Video Consult (Demo)',
      nameAr: 'استشارة فيديو (تجريبي)',
      specialtyId: specialty.id,
      priceMinor: 2000,
      durationMinutes: 20,
      type: 'VIDEO',
    },
  });

  const patientUser = await prisma.user.create({
    data: {
      email: EMAILS.patient,
      passwordHash,
      role: 'PATIENT',
      name: 'Demo Patient',
      nameAr: 'مريض تجريبي',
      status: 'ACTIVE',
    },
  });
  const patient = await prisma.patient.create({ data: { userId: patientUser.id, allergies: [] } });

  // A real appointment (not something the patient has to discover through search — see file
  // header for why the demo doctor is deliberately unverified/unlisted, which also means it
  // 404s on the *public* profile route). This is what lets "log in as the demo patient" show
  // something immediately, and gives the doctor/receptionist a row to act on and the video
  // call flow something to join.
  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      doctorId: doctor.id,
      patientId: patient.id,
      serviceId: videoService.id,
      type: 'VIDEO',
      status: 'CONFIRMED',
      scheduledAt: (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(10, 0, 0, 0);
        return d;
      })(),
      durationMinutes: 20,
      priceMinor: 2000,
    },
  });
  await prisma.videoSession.create({
    data: { appointmentId: appointment.id, roomId: `demo-${appointment.id}` },
  });

  const repUser = await prisma.user.create({
    data: {
      email: EMAILS.rep,
      passwordHash,
      role: 'REPRESENTATIVE',
      name: 'Demo Representative',
      nameAr: 'مندوب تجريبي',
      status: 'ACTIVE',
    },
  });
  const rep = await prisma.representative.create({ data: { userId: repUser.id } });
  await prisma.representativeAssignment.create({ data: { representativeId: rep.id, tenantId: tenant.id } });

  const supplierUser = await prisma.user.create({
    data: {
      email: EMAILS.supplier,
      passwordHash,
      role: 'SUPPLIER',
      name: 'Demo Supplier Contact',
      status: 'ACTIVE',
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: 'Demo Medical Supplies', nameAr: 'مستلزمات طبية تجريبية', countryId: country.id },
  });
  await prisma.equipmentProduct.create({
    data: {
      supplierId: supplier.id,
      name: 'Digital Blood Pressure Monitor (Demo)',
      nameAr: 'جهاز ضغط رقمي (تجريبي)',
      category: 'Diagnostic',
      priceMinor: 4500,
      stockQty: 25,
      status: 'PUBLISHED',
    },
  });

  console.log('Demo accounts created — all under the same password you supplied:\n');
  console.log(`  Clinic admin:   ${EMAILS.clinicAdmin}`);
  console.log(`  Receptionist:   ${EMAILS.reception}`);
  console.log(`  Doctor:         ${EMAILS.doctor}  (doctor id: ${doctor.id})`);
  console.log(`  Patient:        ${EMAILS.patient}`);
  console.log(`  Representative: ${EMAILS.rep}`);
  console.log(`  Supplier:       ${EMAILS.supplier}`);
  console.log(`\nTenant id: ${tenant.id}`);
  console.log(`A confirmed video appointment between the demo doctor and demo patient is already on the calendar for tomorrow 10:00 UTC — log in as either to join the call.`);
  console.log('\nNot publicly listed on purpose (tenant PENDING_VERIFICATION, doctor unverified) — only reachable by logging in directly.');
  console.log('Run DEMO_ACTION=cleanup any time to remove all of this, including anything created while testing.');
}

async function cleanup() {
  const clinicAdmin = await prisma.user.findFirst({ where: { email: EMAILS.clinicAdmin } });
  const tenantId = clinicAdmin?.tenantId ?? null;

  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  const demoUserIds = demoUsers.map((u) => u.id);

  if (!tenantId && demoUserIds.length === 0) {
    console.log('No demo data found — nothing to clean up.');
    return;
  }

  const doctors = tenantId ? await prisma.doctor.findMany({ where: { tenantId }, select: { id: true } }) : [];
  const doctorIds = doctors.map((d) => d.id);
  const patients = await prisma.patient.findMany({ where: { userId: { in: demoUserIds } }, select: { id: true } });
  const patientIds = patients.map((p) => p.id);
  const suppliers = await prisma.supplier.findMany({ where: { userId: { in: demoUserIds } }, select: { id: true } });
  const supplierIds = suppliers.map((s) => s.id);
  const appointments = tenantId ? await prisma.appointment.findMany({ where: { tenantId }, select: { id: true } }) : [];
  const appointmentIds = appointments.map((a) => a.id);
  const orders = supplierIds.length
    ? await prisma.equipmentOrder.findMany({ where: { supplierId: { in: supplierIds } }, select: { id: true } })
    : [];
  const orderIds = orders.map((o) => o.id);

  // Deepest-first: nothing here has an onDelete cascade configured, so order is load-bearing.
  if (appointmentIds.length) {
    await prisma.videoSignal.deleteMany({ where: { videoSession: { appointmentId: { in: appointmentIds } } } });
    await prisma.videoSession.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.queueEvent.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.review.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.commission.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.payment.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.prescription.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.medicalRecord.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  }
  if (orderIds.length) {
    await prisma.equipmentOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.equipmentOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (supplierIds.length) {
    await prisma.equipmentProduct.deleteMany({ where: { supplierId: { in: supplierIds } } });
  }
  if (patientIds.length) {
    // A demo patient could in principle have booked with a non-demo doctor too — only the
    // records/prescriptions belonging to the demo tenant were removed above; this catches
    // nothing left dangling for the patient row itself.
    await prisma.medicalRecord.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
  }
  if (doctorIds.length) {
    await prisma.doctorBranch.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await prisma.schedule.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await prisma.scheduleException.deleteMany({ where: { doctorId: { in: doctorIds } } });
  }
  if (tenantId) {
    await prisma.representativeAssignment.deleteMany({ where: { tenantId } });
    await prisma.commissionRule.deleteMany({ where: { tenantId } });
    await prisma.tenantInsurance.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.service.deleteMany({ where: { tenantId } });
    await prisma.doctor.deleteMany({ where: { tenantId } });
    await prisma.staff.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
  }
  if (patientIds.length) await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
  if (supplierIds.length) await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  await prisma.representative.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: demoUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });

  console.log(`Removed ${demoUserIds.length} demo user(s)${tenantId ? ' and the demo tenant' : ''} — nothing left.`);
}

async function main() {
  const action = process.env.DEMO_ACTION;
  if (action === 'seed') return seed();
  if (action === 'cleanup') return cleanup();
  throw new Error('Set DEMO_ACTION=seed or DEMO_ACTION=cleanup.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

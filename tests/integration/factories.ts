import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

/**
 * Test data factories.
 *
 * Every factory namespaces its rows with a per-run token, and `cleanupWorld` deletes
 * exactly what it created. Two reasons this matters more than usual here:
 *
 * - These tests run against a developer's real database, which may hold seed data. A
 *   `deleteMany({})` "cleanup" would wipe it, and someone would eventually run that against
 *   something they cared about.
 * - Tenant-isolation tests need *two* tenants that genuinely coexist. Truncating between
 *   tests would remove the very condition under test.
 */

export interface TestWorld {
  token: string;
  tenantId: string;
  branchId: string;
  doctorId: string;
  doctorUserId: string;
  serviceId: string;
  patientId: string;
  patientUserId: string;
  specialtyId: string;
  /** Session shaped exactly like the one route handlers receive. */
  staffSession: SessionUser;
  patientSession: SessionUser;
}

const PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ';

export async function createWorld(label = 'w'): Promise<TestWorld> {
  const token = `test-${label}-${randomUUID().slice(0, 8)}`;

  const country = await db.country.upsert({
    where: { code: 'TT' },
    update: {},
    create: {
      code: 'TT',
      name: 'Testland',
      nameAr: 'أرض الاختبار',
      currency: 'JOD',
      phonePrefix: '+900',
      timezone: 'UTC',
      languages: ['ar', 'en'],
    },
  });

  const city = await db.city.upsert({
    where: { countryId_name: { countryId: country.id, name: 'Test City' } },
    update: {},
    create: { countryId: country.id, name: 'Test City', nameAr: 'مدينة الاختبار' },
  });

  const specialty = await db.specialty.upsert({
    where: { slug: 'test-specialty' },
    update: {},
    create: { slug: 'test-specialty', name: 'Test Specialty', nameAr: 'تخصص اختباري' },
  });

  const tenant = await db.tenant.create({
    data: {
      type: 'CLINIC',
      name: `${token} Clinic`,
      nameAr: `عيادة ${token}`,
      countryId: country.id,
      status: 'ACTIVE',
    },
  });

  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: `${token} Branch`, address: 'Test St', cityId: city.id, openingHours: {} },
  });

  const staffUser = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: `${token}-admin@test.local`,
      passwordHash: PASSWORD_HASH,
      role: 'TENANT_ADMIN',
      name: `${token} Admin`,
      status: 'ACTIVE',
    },
  });

  const doctorUser = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: `${token}-doctor@test.local`,
      passwordHash: PASSWORD_HASH,
      role: 'DOCTOR',
      name: `${token} Doctor`,
      status: 'ACTIVE',
    },
  });

  const doctor = await db.doctor.create({
    data: {
      userId: doctorUser.id,
      tenantId: tenant.id,
      specialtyId: specialty.id,
      licenseNumber: `LIC-${token}`,
      yearsExperience: 5,
      verified: true,
      verificationStatus: 'VERIFIED',
      consultationPriceMinor: 5000,
      currency: 'JOD',
      languages: ['ar'],
      branches: { create: { branchId: branch.id } },
      schedules: {
        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          startTime: '08:00',
          endTime: '18:00',
          slotDurationMinutes: 30,
          bufferMinutes: 0,
        })),
      },
    },
  });

  const service = await db.service.create({
    data: {
      tenantId: tenant.id,
      name: `${token} Consultation`,
      nameAr: 'استشارة',
      specialtyId: specialty.id,
      durationMinutes: 30,
      priceMinor: 5000,
      currency: 'JOD',
      isActive: true,
    },
  });

  const patientUser = await db.user.create({
    data: {
      email: `${token}-patient@test.local`,
      passwordHash: PASSWORD_HASH,
      role: 'PATIENT',
      name: `${token} Patient`,
      status: 'ACTIVE',
    },
  });
  const patient = await db.patient.create({ data: { userId: patientUser.id, allergies: [] } });

  return {
    token,
    tenantId: tenant.id,
    branchId: branch.id,
    doctorId: doctor.id,
    doctorUserId: doctorUser.id,
    serviceId: service.id,
    patientId: patient.id,
    patientUserId: patientUser.id,
    specialtyId: specialty.id,
    staffSession: {
      id: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: 'TENANT_ADMIN',
      tenantId: tenant.id,
      locale: 'ar',
      mustChangePassword: false,
    },
    patientSession: {
      id: patientUser.id,
      email: patientUser.email,
      name: patientUser.name,
      role: 'PATIENT',
      tenantId: null,
      locale: 'ar',
      mustChangePassword: false,
    },
  };
}

/** Deletes only what `createWorld` created, in foreign-key-safe order. */
export async function cleanupWorld(world: TestWorld): Promise<void> {
  const appointments = await db.appointment.findMany({
    where: { tenantId: world.tenantId },
    select: { id: true },
  });
  const appointmentIds = appointments.map((a) => a.id);

  await db.commission.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
  await db.payment.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
  await db.queueEvent.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
  await db.prescription.deleteMany({ where: { tenantId: world.tenantId } });
  await db.medicalRecord.deleteMany({ where: { tenantId: world.tenantId } });
  await db.appointment.deleteMany({ where: { tenantId: world.tenantId } });
  await db.schedule.deleteMany({ where: { doctorId: world.doctorId } });
  await db.scheduleException.deleteMany({ where: { doctorId: world.doctorId } });
  await db.doctorBranch.deleteMany({ where: { doctorId: world.doctorId } });
  await db.doctor.deleteMany({ where: { tenantId: world.tenantId } });
  await db.service.deleteMany({ where: { tenantId: world.tenantId } });
  await db.branch.deleteMany({ where: { tenantId: world.tenantId } });
  await db.subscription.deleteMany({ where: { tenantId: world.tenantId } });
  await db.commissionRule.deleteMany({ where: { tenantId: world.tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId: world.tenantId } });
  await db.aiInteraction.deleteMany({ where: { tenantId: world.tenantId } });
  await db.patient.deleteMany({ where: { id: world.patientId } });
  await db.notification.deleteMany({ where: { user: { email: { startsWith: world.token } } } });
  await db.auditLog.deleteMany({ where: { actor: { email: { startsWith: world.token } } } });
  await db.user.deleteMany({ where: { email: { startsWith: world.token } } });
  await db.tenant.deleteMany({ where: { id: world.tenantId } });
}

/** A slot far enough ahead that availability rules and lead-time checks pass. */
export function futureSlot(daysAhead = 3, hourUtc = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

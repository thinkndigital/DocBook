import { db } from '@/lib/db';
import { encryptOptional, decryptOptional } from '@/lib/crypto/field-encryption';
import {
  assertCanAccessPatientRecords,
  auditClinicalAccess,
  ClinicalAccessDeniedError,
  type ClinicalActor,
} from '@/lib/services/clinical-access';

export class MedicalRecordNotFoundError extends Error {}

export const MEDICAL_RECORD_TYPES = ['VISIT_NOTE', 'LAB_REPORT', 'IMAGING', 'DIAGNOSIS'] as const;

interface CreateMedicalRecordInput {
  patientId: string;
  appointmentId?: string;
  type: string;
  diagnosis?: string;
  notes?: string;
}

function decryptRecord<T extends { diagnosis: string | null; notes: string | null }>(record: T): T {
  return { ...record, diagnosis: decryptOptional(record.diagnosis), notes: decryptOptional(record.notes) };
}

const RECORD_INCLUDE = {
  doctor: { include: { user: { select: { name: true } } } },
  attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
} as const;

/** Doctors only; a patient can't author a clinical record about themselves. */
export async function createMedicalRecord(input: CreateMedicalRecordInput, actor: ClinicalActor) {
  if (!actor.doctorId) throw new ClinicalAccessDeniedError('Only a doctor may create a clinical record.');
  await assertCanAccessPatientRecords(actor, input.patientId);

  const doctor = await db.doctor.findUniqueOrThrow({ where: { id: actor.doctorId } });

  const record = await db.medicalRecord.create({
    data: {
      tenantId: doctor.tenantId,
      patientId: input.patientId,
      doctorId: actor.doctorId,
      appointmentId: input.appointmentId,
      type: input.type,
      diagnosis: encryptOptional(input.diagnosis),
      notes: encryptOptional(input.notes),
    },
    include: RECORD_INCLUDE,
  });

  await auditClinicalAccess(actor, 'MEDICAL_RECORD_CREATED', 'MedicalRecord', record.id, {
    tenantId: doctor.tenantId,
    patientId: input.patientId,
  });

  return decryptRecord(record);
}

export async function listPatientMedicalRecords(patientId: string, actor: ClinicalActor) {
  await assertCanAccessPatientRecords(actor, patientId);

  const records = await db.medicalRecord.findMany({
    where: { patientId, deletedAt: null },
    include: RECORD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  // Reading a patient's chart is itself a sensitive event and is logged as one.
  await auditClinicalAccess(actor, 'MEDICAL_RECORDS_ACCESSED', 'Patient', patientId, { patientId });

  return records.map(decryptRecord);
}

export async function getMedicalRecord(id: string, actor: ClinicalActor) {
  const record = await db.medicalRecord.findFirst({ where: { id, deletedAt: null }, include: RECORD_INCLUDE });
  if (!record) throw new MedicalRecordNotFoundError('No medical record with that id.');

  await assertCanAccessPatientRecords(actor, record.patientId);
  await auditClinicalAccess(actor, 'MEDICAL_RECORD_ACCESSED', 'MedicalRecord', record.id, {
    tenantId: record.tenantId,
    patientId: record.patientId,
  });

  return decryptRecord(record);
}

/** Patients a doctor may legitimately open — everyone they have an appointment with. */
export async function listDoctorPatients(doctorId: string) {
  const appointments = await db.appointment.findMany({
    where: { doctorId },
    select: {
      patientId: true,
      scheduledAt: true,
      patient: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  const seen = new Map<string, (typeof appointments)[number]>();
  for (const appt of appointments) {
    if (!seen.has(appt.patientId)) seen.set(appt.patientId, appt);
  }
  return Array.from(seen.values());
}

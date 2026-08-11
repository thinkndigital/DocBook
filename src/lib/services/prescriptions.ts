import { db } from '@/lib/db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { encryptOptional, decryptOptional, encryptField, decryptField } from '@/lib/crypto/field-encryption';
import { getStorageProvider } from '@/lib/storage';
import {
  assertCanAccessPatientRecords,
  auditClinicalAccess,
  ClinicalAccessDeniedError,
  type ClinicalActor,
} from '@/lib/services/clinical-access';
import { dispatchNotificationAsync } from '@/lib/services/notifications';

export class PrescriptionNotFoundError extends Error {}
export class InvalidAppointmentError extends Error {}

export interface MedicationInput {
  name: string;
  dosage: string;
  frequency: string;
  durationDays?: number;
  instructions?: string;
}

export interface CreatePrescriptionInput {
  appointmentId: string;
  diagnosis?: string;
  instructions?: string;
  medications: MedicationInput[];
}

const PRESCRIPTION_INCLUDE = {
  medications: true,
  doctor: { include: { user: { select: { name: true } }, specialty: true } },
  patient: { include: { user: { select: { name: true } } } },
  appointment: { select: { id: true, scheduledAt: true, branch: { select: { name: true } } } },
} as const;

type RawPrescription = Awaited<ReturnType<typeof db.prescription.findFirstOrThrow<{ include: typeof PRESCRIPTION_INCLUDE }>>>;

/** Medication rows are clinical content too, so they are encrypted alongside the narrative fields. */
function decryptPrescription(p: RawPrescription) {
  return {
    ...p,
    diagnosis: decryptOptional(p.diagnosis),
    instructions: decryptOptional(p.instructions),
    medications: p.medications.map((m) => ({
      ...m,
      name: decryptField(m.name),
      dosage: decryptField(m.dosage),
      frequency: decryptField(m.frequency),
      instructions: decryptOptional(m.instructions),
    })),
  };
}

export async function createPrescription(input: CreatePrescriptionInput, actor: ClinicalActor) {
  if (!actor.doctorId) throw new ClinicalAccessDeniedError('Only a doctor may issue a prescription.');

  const appointment = await db.appointment.findUnique({ where: { id: input.appointmentId } });
  if (!appointment) throw new InvalidAppointmentError('No appointment with that id.');
  if (appointment.doctorId !== actor.doctorId) {
    throw new ClinicalAccessDeniedError('You may only prescribe for your own appointments.');
  }

  await assertCanAccessPatientRecords(actor, appointment.patientId);

  const created = await db.prescription.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      doctorId: actor.doctorId,
      patientId: appointment.patientId,
      diagnosis: encryptOptional(input.diagnosis),
      instructions: encryptOptional(input.instructions),
      medications: {
        create: input.medications.map((m) => ({
          name: encryptField(m.name),
          dosage: encryptField(m.dosage),
          frequency: encryptField(m.frequency),
          durationDays: m.durationDays,
          instructions: encryptOptional(m.instructions),
        })),
      },
    },
    include: PRESCRIPTION_INCLUDE,
  });

  await auditClinicalAccess(actor, 'PRESCRIPTION_CREATED', 'Prescription', created.id, {
    tenantId: appointment.tenantId,
    patientId: appointment.patientId,
  });

  // Generate and store the PDF immediately so the patient can download it without the
  // clinic having to do anything else.
  const decrypted = decryptPrescription(created);
  const storageKey = await generateAndStorePdf(decrypted);
  await db.prescription.update({ where: { id: created.id }, data: { pdfStorageKey: storageKey } });

  // Carries no clinical detail — just that a prescription exists and where to read it.
  dispatchNotificationAsync({
    event: 'PRESCRIPTION_ISSUED',
    userId: created.patient.userId,
    tenantId: appointment.tenantId,
    vars: { doctorName: created.doctor.user.name },
  });

  return { ...decrypted, pdfStorageKey: storageKey };
}

export async function listPatientPrescriptions(patientId: string, actor: ClinicalActor) {
  await assertCanAccessPatientRecords(actor, patientId);
  const rows = await db.prescription.findMany({
    where: { patientId, deletedAt: null },
    include: PRESCRIPTION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  await auditClinicalAccess(actor, 'PRESCRIPTIONS_ACCESSED', 'Patient', patientId, { patientId });
  return rows.map(decryptPrescription);
}

export async function getPrescription(id: string, actor: ClinicalActor) {
  const row = await db.prescription.findFirst({ where: { id, deletedAt: null }, include: PRESCRIPTION_INCLUDE });
  if (!row) throw new PrescriptionNotFoundError('No prescription with that id.');
  await assertCanAccessPatientRecords(actor, row.patientId);
  await auditClinicalAccess(actor, 'PRESCRIPTION_ACCESSED', 'Prescription', row.id, {
    tenantId: row.tenantId,
    patientId: row.patientId,
  });
  return decryptPrescription(row);
}

/**
 * Builds the printable prescription. Uses WinAnsi-safe output: pdf-lib's standard fonts
 * cannot encode Arabic glyphs, so the document is laid out in English with the patient and
 * doctor names as stored. Proper bilingual output needs an embedded Unicode font with
 * Arabic shaping — noted in ROADMAP.md rather than silently emitting broken glyphs.
 */
async function generateAndStorePdf(p: ReturnType<typeof decryptPrescription>): Promise<string> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.45, 0.5);
  const brand = rgb(0.05, 0.49, 0.38);
  let y = 790;

  const draw = (text: string, opts: { size?: number; bold?: boolean; color?: typeof ink; indent?: number } = {}) => {
    page.drawText(sanitise(text), {
      x: 50 + (opts.indent ?? 0),
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: opts.color ?? ink,
    });
  };

  draw('DocBook', { size: 20, bold: true, color: brand });
  y -= 18;
  draw('Medical Prescription', { size: 13, bold: true });
  y -= 14;
  draw(`Prescription ID: ${p.id}`, { size: 8, color: muted });
  y -= 24;

  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
  y -= 22;

  draw('Patient', { bold: true });
  y -= 15;
  draw(p.patient.user.name);
  y -= 22;

  draw('Prescriber', { bold: true });
  y -= 15;
  draw(`${p.doctor.user.name} — ${p.doctor.specialty.name}`);
  y -= 15;
  draw(`License: ${p.doctor.licenseNumber}`, { size: 9, color: muted });
  y -= 22;

  draw('Issued', { bold: true });
  y -= 15;
  draw(new Date(p.createdAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
  y -= 15;
  draw(p.appointment.branch.name, { size: 9, color: muted });
  y -= 24;

  if (p.diagnosis) {
    draw('Diagnosis', { bold: true });
    y -= 15;
    for (const line of wrap(p.diagnosis, 95)) {
      draw(line);
      y -= 13;
    }
    y -= 10;
  }

  draw('Medications', { bold: true });
  y -= 17;

  p.medications.forEach((m, i) => {
    draw(`${i + 1}. ${m.name}`, { bold: true });
    y -= 14;
    const duration = m.durationDays ? ` for ${m.durationDays} day(s)` : '';
    draw(`${m.dosage} — ${m.frequency}${duration}`, { size: 10, indent: 14 });
    y -= 13;
    if (m.instructions) {
      for (const line of wrap(m.instructions, 88)) {
        draw(line, { size: 9, color: muted, indent: 14 });
        y -= 12;
      }
    }
    y -= 8;
  });

  if (p.instructions) {
    y -= 6;
    draw('Instructions', { bold: true });
    y -= 15;
    for (const line of wrap(p.instructions, 95)) {
      draw(line);
      y -= 13;
    }
  }

  page.drawText('This prescription was issued electronically via DocBook.', {
    x: 50,
    y: 45,
    size: 8,
    font,
    color: muted,
  });

  const bytes = Buffer.from(await pdf.save());
  const key = `prescriptions/${p.id}.pdf`;
  await getStorageProvider().put(key, bytes, 'application/pdf');
  return key;
}

/** pdf-lib's standard fonts are WinAnsi — strip anything they cannot encode rather than throwing mid-generation. */
function sanitise(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E]/g, '?');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

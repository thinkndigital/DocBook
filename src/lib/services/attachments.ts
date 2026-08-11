import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import {
  assertCanAccessPatientRecords,
  auditClinicalAccess,
  ClinicalAccessDeniedError,
  type ClinicalActor,
} from '@/lib/services/clinical-access';

export class InvalidFileError extends Error {}
export class AttachmentNotFoundError extends Error {}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Magic-byte signatures. The browser-supplied Content-Type is attacker-controlled and is
 * NOT trusted — a .exe renamed to .pdf announces itself as application/pdf. We sniff the
 * actual leading bytes and reject anything whose real content isn't an allowed type.
 */
const SIGNATURES: Array<{ mime: string; ext: string[]; test: (b: Buffer) => boolean }> = [
  { mime: 'application/pdf', ext: ['pdf'], test: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: ['png'],
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export function detectContentType(data: Buffer): { mime: string; ext: string[] } {
  const match = SIGNATURES.find((s) => s.test(data));
  if (!match) {
    throw new InvalidFileError('Unsupported file type. Only PDF, JPEG, and PNG are accepted.');
  }
  return { mime: match.mime, ext: match.ext };
}

interface UploadInput {
  patientId: string;
  medicalRecordId?: string;
  fileName: string;
  data: Buffer;
}

export async function uploadPatientDocument(input: UploadInput, actor: ClinicalActor) {
  if (input.data.byteLength === 0) throw new InvalidFileError('File is empty.');
  if (input.data.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidFileError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`);
  }

  // Content sniffing happens before anything touches storage.
  const detected = detectContentType(input.data);

  await assertCanAccessPatientRecords(actor, input.patientId);

  const patient = await db.patient.findUniqueOrThrow({ where: { id: input.patientId } });

  let tenantId: string | null = null;
  if (input.medicalRecordId) {
    const record = await db.medicalRecord.findUnique({ where: { id: input.medicalRecordId } });
    if (!record || record.patientId !== input.patientId) {
      throw new InvalidFileError('Medical record does not exist or belongs to another patient.');
    }
    tenantId = record.tenantId;
  } else {
    // A patient-uploaded document isn't owned by any clinic; attribute it to the tenant of
    // their most recent appointment so it is reachable in that clinic's context.
    const latest = await db.appointment.findFirst({
      where: { patientId: input.patientId },
      orderBy: { scheduledAt: 'desc' },
      select: { tenantId: true },
    });
    tenantId = latest?.tenantId ?? null;
  }

  if (!tenantId) {
    throw new InvalidFileError('Cannot attach a document before the patient has any appointment.');
  }

  // Storage keys are random, never derived from the filename — a predictable key would let
  // someone guess at other patients' objects.
  const safeExt = detected.ext[0];
  const storageKey = `patient-documents/${patient.id}/${randomUUID()}.${safeExt}`;
  await getStorageProvider().put(storageKey, input.data, detected.mime);

  const attachment = await db.attachment.create({
    data: {
      ownerType: input.medicalRecordId ? 'MEDICAL_RECORD' : 'PATIENT_UPLOAD',
      medicalRecordId: input.medicalRecordId,
      tenantId,
      patientId: input.patientId,
      // Store the original name for display only; it is never used to build a path.
      fileName: input.fileName.slice(0, 200),
      mimeType: detected.mime,
      sizeBytes: input.data.byteLength,
      storageKey,
      encrypted: false,
      uploadedByUserId: actor.session.id,
    },
  });

  await auditClinicalAccess(actor, 'ATTACHMENT_UPLOADED', 'Attachment', attachment.id, {
    tenantId,
    patientId: input.patientId,
  });

  return attachment;
}

export async function listPatientAttachments(patientId: string, actor: ClinicalActor) {
  await assertCanAccessPatientRecords(actor, patientId);
  return db.attachment.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, ownerType: true },
  });
}

/**
 * Issues a short-lived signed URL. The signature is a convenience for the browser, not the
 * authorisation itself — the download route re-checks the caller's permission, so a leaked
 * URL alone is not sufficient authority to read a medical document.
 */
export async function getAttachmentDownloadUrl(attachmentId: string, actor: ClinicalActor) {
  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw new AttachmentNotFoundError('No attachment with that id.');
  if (!attachment.patientId) throw new ClinicalAccessDeniedError('Attachment is not linked to a patient.');

  await assertCanAccessPatientRecords(actor, attachment.patientId);
  await auditClinicalAccess(actor, 'ATTACHMENT_ACCESSED', 'Attachment', attachment.id, {
    tenantId: attachment.tenantId,
    patientId: attachment.patientId,
  });

  const url = await getStorageProvider().getSignedUrl(attachment.storageKey, 300); // 5 minutes
  return { url, fileName: attachment.fileName, mimeType: attachment.mimeType };
}

/** Used by the download route to re-authorise before streaming bytes. */
export async function assertCanDownloadStorageKey(storageKey: string, actor: ClinicalActor) {
  if (storageKey.startsWith('prescriptions/')) {
    const prescriptionId = storageKey.replace('prescriptions/', '').replace('.pdf', '');
    const prescription = await db.prescription.findUnique({ where: { id: prescriptionId } });
    if (!prescription) throw new AttachmentNotFoundError('Unknown file.');
    await assertCanAccessPatientRecords(actor, prescription.patientId);
    return;
  }

  const attachment = await db.attachment.findFirst({ where: { storageKey } });
  if (!attachment?.patientId) throw new AttachmentNotFoundError('Unknown file.');
  await assertCanAccessPatientRecords(actor, attachment.patientId);
}

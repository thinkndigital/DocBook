import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { okResponse } from '@/lib/api/respond';
import { parseBody } from '@/lib/api/validate';
import { withClinicalAuthorization } from '@/lib/api/clinical';
import { createMedicalRecordSchema } from '@/lib/validation/clinical';
import { listPatientMedicalRecords, createMedicalRecord } from '@/lib/services/medical-records';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'medical_record:read_assigned', async (actor) =>
    okResponse(await listPatientMedicalRecords(params.id, actor))
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'medical_record:create', async (actor) => {
    const body = await parseBody(req, createMedicalRecordSchema);
    // The path is authoritative for whose chart is being written to.
    const record = await createMedicalRecord({ ...body, patientId: params.id }, actor);
    return okResponse(record, 201);
  });
}

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { okResponse } from '@/lib/api/respond';
import { parseBody } from '@/lib/api/validate';
import { withClinicalAuthorization } from '@/lib/api/clinical';
import { createPrescriptionSchema } from '@/lib/validation/clinical';
import { createPrescription } from '@/lib/services/prescriptions';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'prescription:create', async (actor) => {
    const body = await parseBody(req, createPrescriptionSchema);
    const prescription = await createPrescription(body, actor);
    return okResponse(prescription, 201);
  });
}

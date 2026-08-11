import { errorResponse, okResponse } from '@/lib/api/respond';
import { getPublicDoctor } from '@/lib/services/marketplace';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doctor = await getPublicDoctor(params.id);
  if (!doctor) return errorResponse('DOCTOR_NOT_FOUND', 'No doctor with that id.', 404);
  return okResponse(doctor);
}

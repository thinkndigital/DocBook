import { okResponse } from '@/lib/api/respond';
import { listPublicSpecialties } from '@/lib/services/marketplace';

export const dynamic = 'force-dynamic';

export async function GET() {
  return okResponse(await listPublicSpecialties());
}

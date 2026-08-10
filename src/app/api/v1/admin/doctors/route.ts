import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { listPendingDoctors } from '@/lib/services/doctors';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'doctor:verify', async () => okResponse(await listPendingDoctors()));
}

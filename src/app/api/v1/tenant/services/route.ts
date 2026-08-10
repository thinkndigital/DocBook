import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createServiceSchema } from '@/lib/validation/tenant';
import { listServices, createService } from '@/lib/services/catalog';

export async function GET() {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'service:manage', async () => okResponse(await listServices()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'service:manage', async (user) => {
    try {
      const body = await parseBody(req, createServiceSchema);
      const service = await createService(body, user);
      return okResponse(service, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

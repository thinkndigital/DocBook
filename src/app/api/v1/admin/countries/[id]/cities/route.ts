import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createCitySchema } from '@/lib/validation/admin';
import { listCities, createCity } from '@/lib/services/geography';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'city:manage', async () => okResponse(await listCities(params.id)));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'city:manage', async (user) => {
    try {
      const body = await parseBody(req, createCitySchema);
      const city = await createCity(params.id, body, user);
      return okResponse(city, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

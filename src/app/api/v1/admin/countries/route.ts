import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createCountrySchema } from '@/lib/validation/admin';
import { listCountries, createCountry } from '@/lib/services/geography';

export async function GET() {
  const session = await getSessionUser();
  return withAuthorization(session, 'country:manage', async () => okResponse(await listCountries()));
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'country:manage', async (user) => {
    try {
      const body = await parseBody(req, createCountrySchema);
      const country = await createCountry(body, user);
      return okResponse(country, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

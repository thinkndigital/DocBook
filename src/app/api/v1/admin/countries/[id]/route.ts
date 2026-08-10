import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateCountrySchema } from '@/lib/validation/admin';
import { updateCountry } from '@/lib/services/geography';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withAuthorization(session, 'country:manage', async (user) => {
    try {
      const body = await parseBody(req, updateCountrySchema);
      const country = await updateCountry(params.id, body, user);
      if (!country) return errorResponse('COUNTRY_NOT_FOUND', 'No country with that id.', 404);
      return okResponse(country);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      throw err;
    }
  });
}

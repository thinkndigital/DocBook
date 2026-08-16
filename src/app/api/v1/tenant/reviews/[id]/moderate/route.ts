import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withTenantAuthorization } from '@/lib/api/tenant-scope';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { moderateReviewSchema } from '@/lib/validation/reviews';
import { moderateReview, ReviewNotFoundError, ReviewAlreadyDecidedError } from '@/lib/services/reviews';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withTenantAuthorization(session, 'review:moderate', async (user) => {
    try {
      const body = await parseBody(req, moderateReviewSchema);
      const review = await moderateReview(params.id, body.status, user);
      return okResponse(review);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof ReviewNotFoundError) return errorResponse('REVIEW_NOT_FOUND', err.message, 404);
      if (err instanceof ReviewAlreadyDecidedError) return errorResponse('ALREADY_DECIDED', err.message, 409);
      throw err;
    }
  });
}

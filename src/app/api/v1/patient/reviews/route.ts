import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { withAuthorization } from '@/lib/rbac';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { createReviewSchema } from '@/lib/validation/reviews';
import {
  createReview,
  NotOwnAppointmentError,
  AppointmentNotReviewableError,
  AlreadyReviewedError,
  ReviewNotFoundError,
} from '@/lib/services/reviews';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withAuthorization(session, 'review:create_own', async (user) => {
    try {
      const body = await parseBody(req, createReviewSchema);
      const review = await createReview(body, user);
      return okResponse(review, 201);
    } catch (err) {
      if (err instanceof ValidationError) return validationErrorResponse(err);
      if (err instanceof ReviewNotFoundError) return errorResponse('APPOINTMENT_NOT_FOUND', err.message, 404);
      if (err instanceof NotOwnAppointmentError) return errorResponse('FORBIDDEN', err.message, 403);
      if (err instanceof AppointmentNotReviewableError) return errorResponse('NOT_REVIEWABLE', err.message, 409);
      if (err instanceof AlreadyReviewedError) return errorResponse('ALREADY_REVIEWED', err.message, 409);
      throw err;
    }
  });
}

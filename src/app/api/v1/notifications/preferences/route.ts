import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { parseBody, ValidationError, validationErrorResponse } from '@/lib/api/validate';
import { updateNotificationPreferences } from '@/lib/services/notifications';
import { db } from '@/lib/db';

// IN_APP is intentionally absent: it can't be switched off (see dispatchNotification).
const preferencesSchema = z.object({
  EMAIL: z.boolean().optional(),
  SMS: z.boolean().optional(),
  WHATSAPP: z.boolean().optional(),
  PUSH: z.boolean().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Not authorized.', 401);
  const user = await db.user.findUnique({ where: { id: session.id }, select: { notificationPrefs: true } });
  return okResponse(user?.notificationPrefs ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Not authorized.', 401);
  try {
    const body = await parseBody(req, preferencesSchema);
    await updateNotificationPreferences(session.id, body as Record<string, boolean>);
    return okResponse(body);
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    throw err;
  }
}

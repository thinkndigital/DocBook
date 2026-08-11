import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse } from '@/lib/api/respond';
import { resolveClinicalActor, ClinicalAccessDeniedError } from '@/lib/services/clinical-access';
import { assertCanDownloadStorageKey, AttachmentNotFoundError } from '@/lib/services/attachments';
import { getStorageProvider } from '@/lib/storage';

/**
 * Streams a stored medical file. Three independent checks must all pass:
 *   1. a valid, unexpired signature (proves the URL came from us and hasn't been tampered with)
 *   2. an authenticated session
 *   3. that session's clinical permission for THIS patient's data
 *
 * (3) is the important one: a signed URL that leaks — forwarded in an email, sitting in
 * browser history, captured in a proxy log — still cannot be used by someone who isn't
 * entitled to the record. The signature limits exposure; it is not the authorisation.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const key = searchParams.get('key');
  const expires = Number(searchParams.get('expires'));
  const signature = searchParams.get('signature');

  if (!key || !signature || !Number.isFinite(expires)) {
    return errorResponse('MISSING_PARAMS', 'key, expires, and signature are required.', 400);
  }

  const storage = getStorageProvider();
  if (!storage.verifySignedUrl(key, expires, signature)) {
    return errorResponse('INVALID_SIGNATURE', 'This download link is invalid or has expired.', 403);
  }

  const session = await getSessionUser();
  if (!session) return errorResponse('UNAUTHENTICATED', 'Sign in to download this file.', 401);

  try {
    const actor = await resolveClinicalActor(session);
    await assertCanDownloadStorageKey(key, actor);
  } catch (err) {
    if (err instanceof ClinicalAccessDeniedError) return errorResponse('FORBIDDEN', err.message, 403);
    if (err instanceof AttachmentNotFoundError) return errorResponse('NOT_FOUND', err.message, 404);
    throw err;
  }

  const bytes = await storage.get(key).catch(() => null);
  if (!bytes) return errorResponse('NOT_FOUND', 'File not found.', 404);

  const isPdf = key.endsWith('.pdf');
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': isPdf ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
      // Medical files must never be cached by shared infrastructure.
      'Cache-Control': 'private, no-store',
    },
  });
}

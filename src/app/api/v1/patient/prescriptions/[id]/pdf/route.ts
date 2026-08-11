import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { withClinicalAuthorization } from '@/lib/api/clinical';
import { getPrescription } from '@/lib/services/prescriptions';
import { getStorageProvider } from '@/lib/storage';

/** Returns a short-lived signed URL rather than the bytes, so the browser can download directly. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'prescription:read_own', async (actor) => {
    const prescription = await getPrescription(params.id, actor);
    if (!prescription.pdfStorageKey) {
      return errorResponse('PDF_NOT_READY', 'No PDF has been generated for this prescription.', 404);
    }
    const url = await getStorageProvider().getSignedUrl(prescription.pdfStorageKey, 300);
    return okResponse({ url, expiresInSeconds: 300 });
  });
}

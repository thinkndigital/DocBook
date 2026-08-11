import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { withClinicalAuthorization } from '@/lib/api/clinical';
import { uploadPatientDocument, MAX_UPLOAD_BYTES } from '@/lib/services/attachments';

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'medical_record:read_own', async (actor) => {
    if (!actor.patientId) return errorResponse('FORBIDDEN', 'Not a patient account.', 403);

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') {
      return errorResponse('MISSING_FILE', 'A file field is required.', 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse('FILE_TOO_LARGE', `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`, 413);
    }

    const data = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadPatientDocument(
      { patientId: actor.patientId, fileName: file.name || 'document', data },
      actor
    );

    return okResponse(
      { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes },
      201
    );
  });
}

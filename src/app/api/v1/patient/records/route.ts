import { getSessionUser } from '@/lib/api/session';
import { errorResponse, okResponse } from '@/lib/api/respond';
import { withClinicalAuthorization } from '@/lib/api/clinical';
import { listPatientMedicalRecords } from '@/lib/services/medical-records';
import { listPatientPrescriptions } from '@/lib/services/prescriptions';
import { listPatientAttachments } from '@/lib/services/attachments';

/** A patient's own chart: records, prescriptions, and uploaded documents in one call. */
export async function GET() {
  const session = await getSessionUser();
  return withClinicalAuthorization(session, 'medical_record:read_own', async (actor) => {
    if (!actor.patientId) return errorResponse('FORBIDDEN', 'Not a patient account.', 403);
    const [records, prescriptions, documents] = await Promise.all([
      listPatientMedicalRecords(actor.patientId, actor),
      listPatientPrescriptions(actor.patientId, actor),
      listPatientAttachments(actor.patientId, actor),
    ]);
    return okResponse({ records, prescriptions, documents });
  });
}

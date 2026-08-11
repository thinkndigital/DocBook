import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/lib/i18n/dictionaries';
import { resolveClinicalActor } from '@/lib/services/clinical-access';
import { listPatientMedicalRecords } from '@/lib/services/medical-records';
import { listPatientPrescriptions } from '@/lib/services/prescriptions';
import { listPatientAttachments } from '@/lib/services/attachments';
import { PrescriptionDownload, DocumentUpload } from './record-actions';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, Record<string, string>> = {
  ar: { VISIT_NOTE: 'ملاحظة زيارة', DIAGNOSIS: 'تشخيص', LAB_REPORT: 'تقرير مخبري', IMAGING: 'تقرير أشعة' },
  en: { VISIT_NOTE: 'Visit note', DIAGNOSIS: 'Diagnosis', LAB_REPORT: 'Lab report', IMAGING: 'Imaging report' },
};

const T = {
  ar: {
    title: 'ملفي الصحي',
    records: 'السجلات الطبية',
    prescriptions: 'الوصفات الطبية',
    documents: 'مستنداتي',
    none: 'لا يوجد شيء هنا بعد.',
    download: 'تحميل PDF',
    upload: 'رفع مستند (PDF أو صورة، حتى 10 ميغابايت)',
    privacy: 'ملفك الصحي مشفَّر، ولا يطّلع عليه إلا الأطباء الذين لديك معهم موعد.',
  },
  en: {
    title: 'My health record',
    records: 'Medical records',
    prescriptions: 'Prescriptions',
    documents: 'My documents',
    none: 'Nothing here yet.',
    download: 'Download PDF',
    upload: 'Upload a document (PDF or image, up to 10 MB)',
    privacy: 'Your health record is encrypted, and only doctors you have an appointment with can view it.',
  },
} as const;

export default async function PatientRecordsPage({ params }: { params: { locale: Locale } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${params.locale}/login?callbackUrl=/${params.locale}/patient/records`);
  if (session.user.role !== 'PATIENT') redirect(`/${params.locale}`);

  const t = T[params.locale === 'en' ? 'en' : 'ar'];
  const typeLabels = TYPE_LABEL[params.locale === 'en' ? 'en' : 'ar']!;

  const actor = await resolveClinicalActor(session.user);
  const patientId = actor.patientId!;

  const [records, prescriptions, documents] = await Promise.all([
    listPatientMedicalRecords(patientId, actor),
    listPatientPrescriptions(patientId, actor),
    listPatientAttachments(patientId, actor),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">{t.title}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t.privacy}</p>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-neutral-900">{t.records}</h2>
        {records.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.none}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {records.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <Badge>{typeLabels[r.type] ?? r.type}</Badge>
                  <span className="text-xs text-neutral-500">{r.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                {r.diagnosis && <p className="text-sm font-medium text-neutral-900">{r.diagnosis}</p>}
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{r.notes}</p>}
                {r.doctor && <p className="mt-1 text-xs text-neutral-400">{r.doctor.user.name}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-neutral-900">{t.prescriptions}</h2>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.none}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {prescriptions.map((p) => (
              <li key={p.id} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div>
                    {p.diagnosis && <p className="text-sm font-medium">{p.diagnosis}</p>}
                    <p className="text-xs text-neutral-500">
                      {p.doctor.user.name} · {p.createdAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <PrescriptionDownload prescriptionId={p.id} label={t.download} />
                </div>
                <ul className="mt-1 text-sm text-neutral-700">
                  {p.medications.map((m) => (
                    <li key={m.id}>
                      • {m.name} — {m.dosage}، {m.frequency}
                      {m.durationDays ? ` (${m.durationDays}d)` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">{t.documents}</h2>
        <p className="mb-2 text-sm text-neutral-600">{t.upload}</p>
        <DocumentUpload label={t.upload} />
        {documents.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex justify-between rounded-md bg-neutral-50 px-3 py-2">
                <span>{d.fileName}</span>
                <span className="text-xs text-neutral-500">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

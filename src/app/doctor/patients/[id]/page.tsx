import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db';
import { resolveClinicalActor, ClinicalAccessDeniedError } from '@/lib/services/clinical-access';
import { listPatientMedicalRecords } from '@/lib/services/medical-records';
import { listPatientPrescriptions } from '@/lib/services/prescriptions';
import { NewRecordForm, NewPrescriptionForm } from './clinical-forms';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  VISIT_NOTE: 'ملاحظة زيارة',
  DIAGNOSIS: 'تشخيص',
  LAB_REPORT: 'تقرير مخبري',
  IMAGING: 'تقرير أشعة',
};

export default async function DoctorPatientChartPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const actor = await resolveClinicalActor(session!.user);

  const patient = await db.patient.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!patient) notFound();

  // The service layer enforces the treatment relationship; a doctor who has never seen
  // this patient gets a denial here rather than a rendered (empty) chart.
  let records, prescriptions;
  try {
    [records, prescriptions] = await Promise.all([
      listPatientMedicalRecords(params.id, actor),
      listPatientPrescriptions(params.id, actor),
    ]);
  } catch (err) {
    if (err instanceof ClinicalAccessDeniedError) {
      return (
        <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="mb-2 font-semibold text-red-900">غير مصرّح بالاطلاع</h1>
          <p className="text-sm text-red-800">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  const appointments = await db.appointment.findMany({
    where: { patientId: params.id, doctorId: actor.doctorId },
    orderBy: { scheduledAt: 'desc' },
    select: { id: true, scheduledAt: true },
    take: 20,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">{patient.user.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">الملف الطبي — كل اطلاع على هذا الملف يُسجَّل في سجل التدقيق.</p>

      <NewRecordForm patientId={params.id} />
      <NewPrescriptionForm appointments={appointments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt.toISOString() }))} />

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-neutral-900">السجلات الطبية</h2>
        {records.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد سجلات بعد.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {records.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <Badge>{TYPE_LABEL[r.type] ?? r.type}</Badge>
                  <span className="text-xs text-neutral-500">{r.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                {r.diagnosis && <p className="text-sm font-medium text-neutral-900">{r.diagnosis}</p>}
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{r.notes}</p>}
                <p className="mt-1 text-xs text-neutral-400">{r.doctor?.user.name}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-neutral-900">الوصفات الطبية</h2>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد وصفات بعد.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {prescriptions.map((p) => (
              <li key={p.id} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  {p.diagnosis && <span className="text-sm font-medium">{p.diagnosis}</span>}
                  <span className="text-xs text-neutral-500">{p.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                <ul className="mt-1 text-sm text-neutral-700">
                  {p.medications.map((m) => (
                    <li key={m.id}>
                      • {m.name} — {m.dosage}، {m.frequency}
                      {m.durationDays ? ` (${m.durationDays} يوم)` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

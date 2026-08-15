import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Locale } from '@/lib/i18n/dictionaries';
import { getAppointment } from '@/lib/services/appointments';
import { CallPageClient } from '@/components/video/call-page-client';

export const dynamic = 'force-dynamic';

export default async function PatientVideoCallPage({
  params,
}: {
  params: { locale: Locale; id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${params.locale}/login?callbackUrl=/${params.locale}/patient`);

  const appointment = await getAppointment(params.id);
  if (!appointment || appointment.type !== 'VIDEO') notFound();
  if (appointment.patient.user.id !== session.user.id) redirect(`/${params.locale}/patient`);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">مكالمة فيديو مع د. {appointment.doctor.user.name}</h1>
      <p className="mb-6 text-sm text-neutral-600">{appointment.service.nameAr}</p>
      <CallPageClient appointmentId={appointment.id} backHref={`/${params.locale}/patient`} />
    </div>
  );
}

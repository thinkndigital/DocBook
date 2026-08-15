import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAppointment } from '@/lib/services/appointments';
import { CallPageClient } from '@/components/video/call-page-client';

export const dynamic = 'force-dynamic';

export default async function DoctorVideoCallPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const appointment = await getAppointment(params.id);
  if (!appointment || appointment.type !== 'VIDEO') notFound();
  if (appointment.doctor.user.id !== session.user.id) redirect('/doctor/appointments');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">مكالمة فيديو مع {appointment.patient.user.name}</h1>
      <p className="mb-6 text-sm text-neutral-600">{appointment.service.nameAr}</p>
      <CallPageClient appointmentId={appointment.id} backHref="/doctor/appointments" />
    </div>
  );
}

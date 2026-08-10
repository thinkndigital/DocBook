import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { getOwnDoctorProfile } from '@/lib/services/doctors';
import { ProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';

const VERIFICATION_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

const VERIFICATION_LABEL: Record<string, string> = {
  PENDING: 'بانتظار التحقق من الإدارة',
  VERIFIED: 'موثّق',
  REJECTED: 'مرفوض',
};

export default async function DoctorProfilePage() {
  const session = await getServerSession(authOptions);
  const doctor = await getOwnDoctorProfile(session!.user.id);

  if (!doctor) {
    return <p className="text-neutral-600">لا يوجد ملف طبيب مرتبط بهذا الحساب.</p>;
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{doctor.user.name}</h1>
        <Badge tone={VERIFICATION_TONE[doctor.verificationStatus]}>
          {VERIFICATION_LABEL[doctor.verificationStatus]}
        </Badge>
      </div>
      <p className="mb-6 text-sm text-neutral-600">
        {doctor.specialty.nameAr} · {doctor.branches.map((b) => b.branch.name).join('، ')}
      </p>
      <ProfileForm
        bio={doctor.bio ?? ''}
        bioAr={doctor.bioAr ?? ''}
        consultationPriceJod={doctor.consultationPriceMinor / 100}
        languages={doctor.languages.join(', ')}
      />
    </div>
  );
}

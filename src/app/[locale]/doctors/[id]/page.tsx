import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries';
import { getPublicDoctor, listDoctorBookableServices } from '@/lib/services/marketplace';
import { Badge } from '@/components/ui/badge';
import { BookingWidget } from './booking-widget';

export const dynamic = 'force-dynamic';

export default async function DoctorProfilePage({ params }: { params: { locale: Locale; id: string } }) {
  const dict = getDictionary(params.locale);
  const nameKey: 'name' | 'nameAr' = params.locale === 'ar' ? 'nameAr' : 'name';

  const doctor = await getPublicDoctor(params.id);
  if (!doctor) notFound();

  const [services, session] = await Promise.all([listDoctorBookableServices(params.id), getServerSession(authOptions)]);

  const displayName = doctor.user[nameKey] ?? doctor.user.name;
  const bio = params.locale === 'ar' ? doctor.bioAr ?? doctor.bio : doctor.bio ?? doctor.bioAr;
  const branches = doctor.branches.map((b) => ({
    id: b.branch.id,
    name: b.branch.name,
    nameAr: b.branch.name,
    city: b.branch.city,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">{displayName}</h1>
          {doctor.verified && <Badge tone="success">{dict.doctors.verified}</Badge>}
        </div>
        <p className="mb-1 text-neutral-600">{doctor.specialty[nameKey]}</p>
        <p className="mb-4 text-sm text-neutral-500">
          {doctor.yearsExperience} {dict.doctors.yearsExperience}
        </p>

        {bio && (
          <div className="mb-6">
            <h2 className="mb-1 font-semibold text-neutral-900">{dict.doctorProfile.about}</h2>
            <p className="text-sm text-neutral-700">{bio}</p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="mb-2 font-semibold text-neutral-900">{dict.doctorProfile.branches}</h2>
          <ul className="flex flex-col gap-1 text-sm text-neutral-700">
            {branches.map((b) => (
              <li key={b.id}>
                {b.name} — {b.city[nameKey]}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-lg font-bold text-brand-700">
          {(doctor.consultationPriceMinor / 100).toFixed(2)} {doctor.currency}
          <span className="text-sm font-normal text-neutral-500"> — {dict.doctors.consultationFee}</span>
        </p>
      </div>

      <div>
        {branches.length === 0 || services.length === 0 ? (
          <p className="text-sm text-neutral-500">{dict.doctorProfile.noSlots}</p>
        ) : (
          <BookingWidget
            locale={params.locale}
            dict={dict}
            doctorId={params.id}
            isAuthenticatedPatient={session?.user.role === 'PATIENT'}
            branches={branches}
            services={services}
          />
        )}
      </div>
    </div>
  );
}

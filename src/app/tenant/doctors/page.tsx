import { Badge } from '@/components/ui/badge';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { listBranches } from '@/lib/services/branches';
import { listDoctors } from '@/lib/services/doctors';
import { listSpecialties } from '@/lib/services/specialties';
import { NewDoctorForm } from './new-doctor-form';

export const dynamic = 'force-dynamic';

const VERIFICATION_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
};

const VERIFICATION_LABEL: Record<string, string> = {
  PENDING: 'بانتظار التحقق',
  VERIFIED: 'موثّق',
  REJECTED: 'مرفوض',
};

export default async function DoctorsPage() {
  const [doctors, branches, specialties] = await Promise.all([
    runInSessionTenant(() => listDoctors()),
    runInSessionTenant(() => listBranches()),
    listSpecialties(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الأطباء</h1>
      {branches.length === 0 && (
        <p className="mb-4 text-sm text-amber-700">أضف فرعاً أولاً قبل إضافة طبيب.</p>
      )}
      <NewDoctorForm branches={branches} specialties={specialties} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">التخصص</th>
              <th className="px-4 py-3 font-medium">الفروع</th>
              <th className="px-4 py-3 font-medium">سعر الاستشارة</th>
              <th className="px-4 py-3 font-medium">التوثيق</th>
            </tr>
          </thead>
          <tbody>
            {doctors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا يوجد أطباء بعد.
                </td>
              </tr>
            )}
            {doctors.map((doctor) => (
              <tr key={doctor.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-medium">{doctor.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{doctor.specialty.nameAr}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {doctor.branches.map((db) => db.branch.name).join('، ')}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {(doctor.consultationPriceMinor / 100).toFixed(2)} {doctor.currency}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={VERIFICATION_TONE[doctor.verificationStatus]}>
                    {VERIFICATION_LABEL[doctor.verificationStatus]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

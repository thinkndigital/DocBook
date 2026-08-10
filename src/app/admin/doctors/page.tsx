import { listPendingDoctors } from '@/lib/services/doctors';
import { DoctorVerifyActions } from './doctor-verify-actions';

export const dynamic = 'force-dynamic';

export default async function AdminDoctorsPage() {
  const doctors = await listPendingDoctors();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">توثيق الأطباء</h1>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">الجهة</th>
              <th className="px-4 py-3 font-medium">التخصص</th>
              <th className="px-4 py-3 font-medium">رقم الترخيص</th>
              <th className="px-4 py-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {doctors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا يوجد أطباء بانتظار التوثيق.
                </td>
              </tr>
            )}
            {doctors.map((doctor) => (
              <tr key={doctor.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-medium">{doctor.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{doctor.tenant.nameAr}</td>
                <td className="px-4 py-3 text-neutral-600">{doctor.specialty.nameAr}</td>
                <td className="px-4 py-3 text-neutral-600">{doctor.licenseNumber}</td>
                <td className="px-4 py-3">
                  <DoctorVerifyActions doctorId={doctor.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

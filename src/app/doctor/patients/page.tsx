import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { listDoctorPatients } from '@/lib/services/medical-records';

export const dynamic = 'force-dynamic';

export default async function DoctorPatientsPage() {
  const session = await getServerSession(authOptions);
  const doctor = await db.doctor.findUnique({ where: { userId: session!.user.id } });
  if (!doctor) return <p className="text-neutral-600">لا يوجد ملف طبيب مرتبط بهذا الحساب.</p>;

  const patients = await listDoctorPatients(doctor.id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">مرضاي</h1>
      <p className="mb-6 text-sm text-neutral-500">
        تظهر هنا فقط الحالات التي لديك معها موعد — لا يمكن الاطلاع على ملفات مرضى آخرين.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">المريض</th>
              <th className="px-4 py-3 font-medium">آخر موعد</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                  لا يوجد مرضى بعد.
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <tr key={p.patientId} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-medium">{p.patient.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{p.scheduledAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <Link href={`/doctor/patients/${p.patientId}`} className="text-sm text-brand-700 hover:underline">
                    الملف الطبي
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

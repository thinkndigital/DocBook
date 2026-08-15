import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { listStaff } from '@/lib/services/staff';
import { listBranches } from '@/lib/services/branches';
import { ResetPasswordButton } from '@/components/admin/reset-password-button';
import { NewStaffForm } from './new-staff-form';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const [staff, branches] = await Promise.all([
    runInSessionTenant(() => listStaff()),
    runInSessionTenant(() => listBranches()),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">الموظفون</h1>
      <NewStaffForm branches={branches} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">البريد الإلكتروني</th>
              <th className="px-4 py-3 font-medium">المسمى</th>
              <th className="px-4 py-3 font-medium">الفرع</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا يوجد موظفون بعد.
                </td>
              </tr>
            )}
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-medium">{s.user.name}</td>
                <td className="px-4 py-3 text-neutral-600">{s.user.email}</td>
                <td className="px-4 py-3 text-neutral-600">{s.title ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{s.branch?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <ResetPasswordButton endpoint={`/api/v1/tenant/staff/${s.id}/password`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

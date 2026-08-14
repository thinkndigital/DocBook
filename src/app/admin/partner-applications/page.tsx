import { getSessionUser } from '@/lib/api/session';
import { listPartnerApplications } from '@/lib/services/partner-applications';
import { Badge } from '@/components/ui/badge';
import { ReviewControls } from './review-controls';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  CONTACTED: 'تم التواصل',
  APPROVED: 'مقبول',
  REJECTED: 'مرفوض',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  CONTACTED: 'neutral',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default async function PartnerApplicationsPage() {
  // The layout already refuses anyone who is not SUPER_ADMIN; this reads through the same
  // service the API route uses, so there is one query and one shape.
  const session = await getSessionUser();
  if (!session) return null;

  const applications = await listPartnerApplications({});

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">طلبات الانضمام</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-600">
        طلبات وردت من نموذج عام. قبول الطلب <strong>لا يُنشئ جهة صحية</strong> — يسجّل قرارك
        فقط، ثم تُنشئ الجهة من صفحة «الجهات الصحية» بالتدفّق المعتاد.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">الجهة</th>
              <th className="px-4 py-3 font-medium">التواصل</th>
              <th className="px-4 py-3 font-medium">الموقع</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
              <th className="px-4 py-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  لا توجد طلبات بعد.
                </td>
              </tr>
            ) : (
              applications.map((app) => (
                <tr key={app.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{app.organizationName}</div>
                    <div className="text-xs text-neutral-500">
                      {app.type === 'HOSPITAL' ? 'مستشفى' : 'عيادة'}
                      {app.doctorCount != null && ` · ${app.doctorCount} طبيب`}
                    </div>
                    {app.notes && <p className="mt-1 max-w-sm text-xs text-neutral-600">{app.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div>{app.contactName}</div>
                    <div className="text-xs text-neutral-500">{app.contactEmail}</div>
                    <div className="text-xs text-neutral-500">{app.contactPhone}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {app.country.nameAr}
                    {app.city && ` — ${app.city.nameAr}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[app.status] ?? 'neutral'}>
                      {STATUS_LABEL[app.status] ?? app.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <ReviewControls id={app.id} status={app.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

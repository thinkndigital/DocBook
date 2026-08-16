import { requireTenantAdminPage, runInSessionTenant } from '@/lib/api/tenant-scope';
import { listTenantReviews } from '@/lib/services/reviews';
import { Badge } from '@/components/ui/badge';
import { ReviewModerationActions } from './review-actions';

export const dynamic = 'force-dynamic';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};
const STATUS_TONE: Record<Status, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default async function TenantReviewsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireTenantAdminPage();
  const status: Status = (['PENDING', 'APPROVED', 'REJECTED'] as const).includes(searchParams.status as Status)
    ? (searchParams.status as Status)
    : 'PENDING';
  const reviews = await runInSessionTenant(() => listTenantReviews({ status }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">التقييمات</h1>
      <p className="mb-6 text-sm text-neutral-500">
        تقييمات المرضى للمواعيد المكتملة. لا تظهر ضمن التقييم العام للطبيب إلا بعد الاعتماد.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <a
            key={s}
            href={`?status=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              status === s ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {STATUS_LABEL[s]}
          </a>
        ))}
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-neutral-500">لا توجد تقييمات {STATUS_LABEL[status]}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-medium text-neutral-900">{r.doctor.user.name}</p>
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </div>
              <p className="text-sm text-neutral-600">
                المريض: {r.patient.user.name} — {r.appointment.scheduledAt.toISOString().slice(0, 10)}
              </p>
              <p className="mt-2 text-sm text-neutral-700">
                التقييم العام: {r.ratingOverall}/5 — الطبيب: {r.ratingDoctor}/5
                {r.ratingStaff ? ` — الموظفون: ${r.ratingStaff}/5` : ''}
                {r.ratingWaitTime ? ` — وقت الانتظار: ${r.ratingWaitTime}/5` : ''}
                {r.ratingClinic ? ` — العيادة: ${r.ratingClinic}/5` : ''}
              </p>
              {r.comment && (
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">{r.comment}</p>
              )}
              {r.status === 'PENDING' && <ReviewModerationActions reviewId={r.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

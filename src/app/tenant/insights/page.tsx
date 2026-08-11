import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { runInSessionTenant } from '@/lib/api/tenant-scope';
import { buildClinicBriefing } from '@/lib/services/clinic-briefing';
import { actorKeyForUser } from '@/lib/ai/usage';
import type { RiskBand } from '@/lib/services/no-show-risk';

export const dynamic = 'force-dynamic';

const BAND_TONE: Record<RiskBand, 'neutral' | 'success' | 'warning' | 'danger'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

const BAND_LABEL: Record<RiskBand, string> = {
  LOW: 'منخفض',
  MEDIUM: 'متوسط',
  HIGH: 'مرتفع',
};

/**
 * Clinic insights. The tenant portal is Arabic-only (see ARCHITECTURE.md "i18n"), so the
 * briefing is requested in Arabic.
 *
 * Layout order is deliberate: the computed metrics come first, the AI narrative second.
 * The numbers are the product; the prose is a convenience over them, and putting it above
 * would invite reading the summary instead of the data.
 *
 * The risk table always shows the *factors* beside the score. A receptionist deciding
 * whether to call a patient needs to see "two previous no-shows" rather than "78" — an
 * unexplained number invites either blind trust or blanket dismissal, and both are worse
 * than a number someone can argue with.
 */
export default async function TenantInsightsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const briefing = await runInSessionTenant(() =>
    buildClinicBriefing({
      locale: 'ar',
      actorKey: actorKeyForUser(user.id),
      userId: user.id,
      tenantId: user.tenantId!,
    })
  );

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">رؤى تشغيلية</h1>
        <p className="mt-1 text-sm text-neutral-500">
          مصدر الملخّص: {briefing.provider === 'claude' ? 'نموذج ذكاء اصطناعي' : 'تلخيص محلي بدون خدمة خارجية'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {briefing.metrics.map((metric) => (
          <Card key={metric.label}>
            <div className="text-xs text-neutral-500">{metric.labelAr}</div>
            <div className="mt-1 text-2xl font-bold text-neutral-900">{metric.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold text-neutral-900">الملخّص</h2>
        {briefing.narrative ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{briefing.narrative}</p>
        ) : (
          <p className="text-sm text-neutral-500">
            تعذّر توليد ملخّص نصي حاليًا. الأرقام أعلاه والملاحظات أدناه محسوبة محليًا وغير متأثرة.
          </p>
        )}
        {briefing.observations.length > 0 && (
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-neutral-700">
            {briefing.observations.map((observation) => (
              <li key={observation}>{observation}</li>
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          {briefing.disclaimer}
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-neutral-900">مواعيد مرشّحة للتخلّف عن الحضور</h2>
        <p className="mb-4 text-xs text-neutral-500">
          تقدير محسوب من سجل الحضور السابق ومدة الحجز المسبق — ليس نموذج ذكاء اصطناعي، ولا تُرسل أي بيانات
          خارج المنصة لحسابه. كل عامل مؤثّر معروض بجانب الدرجة.
        </p>

        {briefing.highRisk.length === 0 ? (
          <p className="text-sm text-neutral-500">لا توجد مواعيد عالية الخطورة خلال الأيام السبعة القادمة.</p>
        ) : (
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="py-2 font-medium">المريض</th>
                <th className="py-2 font-medium">الطبيب</th>
                <th className="py-2 font-medium">الموعد</th>
                <th className="py-2 font-medium">الدرجة</th>
                <th className="py-2 font-medium">العوامل</th>
              </tr>
            </thead>
            <tbody>
              {briefing.highRisk.map((risk) => (
                <tr key={risk.appointmentId} className="border-b border-neutral-100 align-top">
                  <td className="py-2 text-neutral-900">{risk.patientName}</td>
                  <td className="py-2 text-neutral-600">{risk.doctorName}</td>
                  <td className="py-2 text-neutral-600">
                    {risk.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-2">
                    <Badge tone={BAND_TONE[risk.band]}>
                      {BAND_LABEL[risk.band]} · {risk.score}
                    </Badge>
                  </td>
                  <td className="py-2 text-xs text-neutral-600">
                    <ul className="space-y-1">
                      {risk.factors.map((factor) => (
                        <li key={factor.labelAr}>
                          {factor.labelAr} ({factor.points > 0 ? '+' : ''}
                          {factor.points})
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

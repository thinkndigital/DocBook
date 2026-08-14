import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { BarList, LineChart } from '@/components/charts/line-chart';
import { RANGE_PRESETS } from '@/lib/analytics/range';
import type { AnalyticsResult } from '@/lib/services/analytics';

/**
 * Shared analytics presentation for all four roles.
 *
 * One component rather than four near-copies: the *data* boundary is what must differ per
 * role, and that boundary lives in `src/lib/services/analytics.ts` where it is enforced by
 * separate query functions. Duplicating the rendering as well would mean four places to fix
 * a formatting bug and no additional isolation.
 *
 * Range switching is plain links, not client state — the pages are Server Components and
 * each range is a real URL, so a clinic manager can bookmark or share "last 90 days".
 */

const RANGE_LABELS: Record<string, { ar: string; en: string }> = {
  '7d': { ar: '٧ أيام', en: '7 days' },
  '30d': { ar: '٣٠ يومًا', en: '30 days' },
  '90d': { ar: '٩٠ يومًا', en: '90 days' },
  '12m': { ar: '١٢ شهرًا', en: '12 months' },
};

function DeltaBadge({ deltaPct, invert }: { deltaPct: number; invert?: boolean }) {
  const rounded = Math.round(deltaPct * 10) / 10;
  // `invert` marks metrics where up is bad (no-show rate), so colour tracks meaning rather
  // than arithmetic sign.
  const good = invert ? rounded < 0 : rounded > 0;
  const neutral = rounded === 0;
  const tone = neutral ? 'text-neutral-500' : good ? 'text-emerald-600' : 'text-red-600';
  return (
    <span className={`text-xs font-medium ${tone}`} dir="ltr">
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  );
}

export function AnalyticsDashboard({
  data,
  title,
  basePath,
  locale = 'ar',
  exportPath,
}: {
  data: AnalyticsResult;
  title: string;
  /** Path the range links point at, e.g. "/tenant/analytics". */
  basePath: string;
  locale?: 'ar' | 'en';
  /** When present, renders a CSV export link for the current range. */
  exportPath?: string;
}) {
  const isAr = locale === 'ar';

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        <nav className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1">
          {RANGE_PRESETS.map((preset) => (
            <Link
              key={preset}
              href={`${basePath}?range=${preset}`}
              className={`rounded px-3 py-1 text-xs ${
                data.range.preset === preset ? 'bg-brand-600 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {isAr ? RANGE_LABELS[preset]!.ar : RANGE_LABELS[preset]!.en}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-xs text-neutral-500">
        {data.range.from.slice(0, 10)} → {data.range.to.slice(0, 10)} · {data.timezoneNote}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.kpis.map((kpi) => (
          <Card key={kpi.key}>
            <div className="text-xs text-neutral-500">{isAr ? kpi.labelAr : kpi.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900">{kpi.value}</span>
              {kpi.deltaPct !== undefined && (
                <DeltaBadge deltaPct={kpi.deltaPct} invert={kpi.key === 'noShowRate' || kpi.key === 'cancelled'} />
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.series.map((series) => (
          <Card key={series.key}>
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">{isAr ? series.labelAr : series.label}</h2>
            <LineChart points={series.points} />
          </Card>
        ))}
      </div>

      {data.breakdowns.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.breakdowns.map((breakdown) => (
            <Card key={breakdown.key}>
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                {isAr ? breakdown.labelAr : breakdown.label}
              </h2>
              <BarList rows={breakdown.rows} locale={locale} />
            </Card>
          ))}
        </div>
      )}

      {data.leaderboard && data.leaderboard.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">{isAr ? 'الأطباء الأكثر انشغالًا' : 'Busiest doctors'}</h2>
          <table className={`w-full text-sm ${isAr ? 'text-right' : 'text-left'}`}>
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="py-2 font-medium">{isAr ? 'الطبيب' : 'Doctor'}</th>
                <th className="py-2 font-medium">{isAr ? 'المواعيد' : 'Appointments'}</th>
                <th className="py-2 font-medium">{isAr ? 'مكتملة' : 'Completed'}</th>
                <th className="py-2 font-medium">{isAr ? 'لم يحضروا' : 'No-shows'}</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((row) => (
                <tr key={row.doctorName} className="border-b border-neutral-100">
                  <td className="py-2 text-neutral-900">{row.doctorName}</td>
                  <td className="py-2 tabular-nums text-neutral-600">{row.total}</td>
                  <td className="py-2 tabular-nums text-neutral-600">{row.completed}</td>
                  <td className="py-2 tabular-nums text-neutral-600">{row.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {exportPath && (
        <a
          href={`${exportPath}?range=${data.range.preset}`}
          className="inline-block rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-700 hover:border-brand-400"
        >
          {isAr ? 'تصدير المواعيد (CSV)' : 'Export appointments (CSV)'}
        </a>
      )}
    </div>
  );
}

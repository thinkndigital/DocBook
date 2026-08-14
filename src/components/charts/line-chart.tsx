import type { SeriesPoint } from '@/lib/analytics/series';

/**
 * Inline-SVG charts, rendered on the server.
 *
 * No charting library. Recharts/Chart.js would each add a client bundle measured in
 * hundreds of kilobytes and force these pages to become Client Components, for what is
 * ultimately a polyline and some rectangles. Server-rendered SVG means the analytics pages
 * ship no chart JavaScript at all, which also keeps them honest for the Phase 13
 * Core Web Vitals work rather than making it harder.
 *
 * The trade accepted: no tooltips, no zoom, no client-side range brushing. Every chart is
 * therefore paired with the underlying numbers (the KPI tiles, the breakdown tables, and
 * the CSV export), so nothing is only knowable by hovering a pixel.
 *
 * These are direction-agnostic: the SVG viewBox renders left-to-right in both locales,
 * which is correct — a time axis runs earliest-to-latest in Arabic charting convention too,
 * and mirroring it would make the series read backwards.
 */

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function shortLabel(bucket: string): string {
  // "2026-08-11" -> "08-11", "2026-08" -> "2026-08"
  return bucket.length === 10 ? bucket.slice(5) : bucket;
}

export function LineChart({
  points,
  height = 160,
  formatValue = (n: number) => String(n),
}: {
  points: SeriesPoint[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  if (points.length === 0) return null;

  const width = 720;
  const padX = 8;
  const padY = 12;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padX + index * stepX;
    const y = height - padY - (point.value / max) * (height - padY * 2);
    return { x, y, point };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1]!.x.toFixed(1)},${height - padY} L${coords[0]!.x.toFixed(1)},${height - padY} Z`;

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]!);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Time series, ${points.length} points, total ${formatValue(total)}, peak ${formatValue(peak.value)} on ${peak.bucket}`}
      >
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="currentColor" strokeWidth="1" className="text-neutral-200" />
        <path d={area} className="fill-brand-600/10" />
        <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-600" />
        {coords.map((c) => (
          <circle key={c.point.bucket} cx={c.x} cy={c.y} r="2.5" className="fill-brand-700" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-neutral-400" dir="ltr">
        <span>{shortLabel(points[0]!.bucket)}</span>
        <span>
          max {formatValue(max)}
        </span>
        <span>{shortLabel(points[points.length - 1]!.bucket)}</span>
      </figcaption>
    </figure>
  );
}

export function BarList({
  rows,
  locale = 'ar',
}: {
  rows: Array<{ label: string; labelAr: string; value: number }>;
  locale?: 'ar' | 'en';
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">{locale === 'ar' ? 'لا توجد بيانات لهذه الفترة.' : 'No data for this period.'}</p>;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-700">{locale === 'ar' ? row.labelAr : row.label}</span>
            <span className="tabular-nums text-neutral-900">{row.value}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-neutral-100">
            <div
              className="h-full rounded bg-brand-500"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

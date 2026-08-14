/**
 * Date-range handling for analytics.
 *
 * Ranges are resolved server-side from a small closed set of presets rather than accepting
 * arbitrary client dates. Two reasons, and the second is the one that matters:
 *
 * - A caller cannot ask for a 10-year daily series and turn a dashboard into a denial of
 *   service against the database.
 * - The bucket count is bounded and known, so the time-series SQL below can generate a
 *   dense series (every day present, zeros included) without unbounded work.
 *
 * All bucketing is done in UTC, matching how the rest of the platform stores time. A clinic
 * in Amman reading "today" will see a boundary three hours off local midnight; per-tenant
 * timezone bucketing needs a `timezone` on the tenant (the `Country` row already carries
 * one) and belongs with the wider timezone work, not smuggled in here. This is stated in
 * the UI rather than left for someone to discover from a discrepancy.
 */

export const RANGE_PRESETS = ['7d', '30d', '90d', '12m'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type Granularity = 'day' | 'month';

export interface ResolvedRange {
  preset: RangePreset;
  from: Date;
  to: Date;
  granularity: Granularity;
  /** Number of buckets in the dense series — used to sanity-check query output. */
  buckets: number;
}

export function isRangePreset(value: string): value is RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value);
}

export function resolveRange(preset: string | null | undefined): ResolvedRange {
  const chosen: RangePreset = preset && isRangePreset(preset) ? preset : '30d';

  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);

  const from = new Date(to);
  let granularity: Granularity = 'day';
  let buckets: number;

  switch (chosen) {
    case '7d':
      from.setUTCDate(from.getUTCDate() - 6);
      buckets = 7;
      break;
    case '90d':
      from.setUTCDate(from.getUTCDate() - 89);
      buckets = 90;
      break;
    case '12m':
      // Monthly buckets past 90 days: 365 daily points is unreadable in a dashboard chart
      // and needlessly heavy to compute.
      from.setUTCMonth(from.getUTCMonth() - 11);
      from.setUTCDate(1);
      granularity = 'month';
      buckets = 12;
      break;
    case '30d':
    default:
      from.setUTCDate(from.getUTCDate() - 29);
      buckets = 30;
      break;
  }

  from.setUTCHours(0, 0, 0, 0);
  return { preset: chosen, from, to, granularity, buckets };
}

/** Bucket key for a date, matching what the SQL `date_trunc` produces. */
export function bucketKey(date: Date, granularity: Granularity): string {
  return granularity === 'month' ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10);
}

/**
 * Produces every bucket in the range, so a chart shows a real zero for a quiet day rather
 * than silently closing the gap and implying continuous activity.
 */
export function denseBuckets(range: ResolvedRange): string[] {
  const keys: string[] = [];
  const cursor = new Date(range.from);

  while (cursor <= range.to) {
    keys.push(bucketKey(cursor, range.granularity));
    if (range.granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

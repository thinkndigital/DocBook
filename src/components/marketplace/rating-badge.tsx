/**
 * Renders nothing when there is no real rating to show — a doctor with zero approved
 * reviews gets no badge at all, never a fabricated "0.0 (0)". Matches the same rule already
 * applied to the SEO json-ld's aggregateRating (src/lib/seo/json-ld.ts).
 */
export function RatingBadge({
  ratingAverage,
  ratingCount,
  reviewsLabel,
}: {
  ratingAverage: number;
  ratingCount: number;
  reviewsLabel: string;
}) {
  if (ratingCount <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-sm text-amber-600" aria-label={`${ratingAverage.toFixed(1)} ${reviewsLabel}`}>
      <span aria-hidden="true">★</span>
      <span className="font-medium">{ratingAverage.toFixed(1)}</span>
      <span className="text-neutral-500">({ratingCount})</span>
    </span>
  );
}

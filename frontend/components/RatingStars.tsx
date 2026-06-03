"use client";

/**
 * Read-only star rating row. Reuses the shared `.host-star` tokens so rating
 * display is consistent across the landing page, directory, profile modal,
 * applicant rows, and dashboards.
 */
export default function RatingStars({
  rating,
  count,
  size = 14,
  showValue = true,
}: {
  rating: number | string;
  /** Optional completed-jobs count rendered as "· N jobs". */
  count?: number;
  size?: number;
  showValue?: boolean;
}) {
  const value = typeof rating === "string" ? parseFloat(rating) : rating;
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe);

  return (
    <span className="rating-stars" aria-label={`Rated ${safe.toFixed(1)} out of 5`}>
      <span className="rating-stars-row" style={{ fontSize: size }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={n <= rounded ? "host-star--on" : "host-star--off"}
            style={{ fontSize: size }}
            aria-hidden="true"
          >
            ★
          </span>
        ))}
      </span>
      {showValue && (
        <span className="rating-stars-value">
          {safe > 0 ? safe.toFixed(1) : "New"}
          {typeof count === "number" && count > 0 && (
            <span className="rating-stars-count"> · {count} job{count === 1 ? "" : "s"}</span>
          )}
        </span>
      )}
    </span>
  );
}

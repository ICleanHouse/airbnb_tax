"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("components.ratingStars");
  const value = typeof rating === "string" ? parseFloat(rating) : rating;
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe);

  return (
    <span className="rating-stars" aria-label={t("ariaLabel", { value: safe.toFixed(1) })}>
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
          {safe > 0 ? safe.toFixed(1) : t("newRating")}
          {typeof count === "number" && count > 0 && (
            <span className="rating-stars-count">{t("jobCount", { count })}</span>
          )}
        </span>
      )}
    </span>
  );
}

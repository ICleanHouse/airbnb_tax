"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, X } from "lucide-react";
import { apiFetch } from "../lib/api";

interface Review {
  id: number;
  job: number;
  reviewer: number;
  reviewer_name: string;
  reviewee: number;
  rating: number;
  comment: string;
  created_at: string;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="review-stars-static" aria-label={`${value} out of 5`}>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </span>
  );
}

/**
 * Two-way review window. Each side reviews the other after a job completes.
 * Double-blind: the counterpart's review is only present in `reviews` once it's
 * been revealed by the server (both submitted, or the 14-day window closed), so
 * this component simply shows it when available and a placeholder otherwise.
 */
export default function ReviewModal({
  jobId,
  jobTitle,
  revieweeId,
  revieweeName,
  meId,
  reviews,
  onClose,
  onSubmitted,
}: {
  jobId: number;
  jobTitle: string;
  revieweeId: number;
  revieweeName: string;
  meId: number;
  reviews: Review[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const myReview = reviews.find((r) => r.job === jobId && r.reviewer === meId) ?? null;
  const theirReview = reviews.find((r) => r.job === jobId && r.reviewee === meId) ?? null;

  const t = useTranslations("components.reviewModal");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (rating < 1) {
      setError(t("errors.noRating"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/feedback/reviews/", {
        method: "POST",
        body: JSON.stringify({
          job_id: jobId,
          reviewee_id: revieweeId,
          rating,
          comment: comment.trim(),
        }),
      });
      if (res.ok) {
        onSubmitted();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || t("errors.submitFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="host-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="host-modal review-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("ariaLabel")}
      >
        <div className="host-modal-header">
          <div>
            <h2>{t("heading")}</h2>
            <p className="host-modal-subtitle">{jobTitle}</p>
          </div>
          <button type="button" className="host-modal-close" onClick={onClose} aria-label={t("closeAriaLabel")}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="review-modal-body">
          {/* Your review */}
          <section className="review-block">
            <h3 className="review-block-title">{t("yourReviewOf", { name: revieweeName })}</h3>
            {myReview ? (
              <div className="review-given">
                <Stars value={myReview.rating} />
                {myReview.comment && <p className="review-given-comment">{myReview.comment}</p>}
                <span className="review-given-note">{t("submitted")}</span>
              </div>
            ) : (
              <div className="review-form">
                <div className="host-stars" role="radiogroup" aria-label={t("ratingAriaLabel")}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`host-star${(hover || rating) >= s ? " host-star--on" : ""}`}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(s)}
                      aria-label={t("starAriaLabel", { count: s })}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  className="review-textarea"
                  placeholder={t("commentPlaceholder", { name: revieweeName })}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                {error && <p className="form-error">{error}</p>}
                <button type="button" className="primary-link" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? t("submitting") : t("submitBtn")}
                </button>
              </div>
            )}
          </section>

          {/* Their review — only visible once revealed (double-blind) */}
          <section className="review-block">
            <h3 className="review-block-title">{t("theirReviewOf", { name: revieweeName })}</h3>
            {theirReview ? (
              <div className="review-given">
                <Stars value={theirReview.rating} />
                {theirReview.comment && <p className="review-given-comment">{theirReview.comment}</p>}
              </div>
            ) : (
              <div className="review-hidden">
                <Lock size={16} aria-hidden />
                <p>
                  {myReview
                    ? t("blindAfterSubmit", { name: revieweeName })
                    : t("blindBeforeSubmit")}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Car, MapPin, MessageSquare, X } from "lucide-react";
import { apiFetch, type PublicCleanerDetail } from "../lib/api";
import RatingStars from "./RatingStars";
import ConnectButton from "./ConnectButton";
import { experienceLabel } from "./CleanerProfileCard";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Full public cleaner profile with a scrollable review history. Fetches the
 * detail payload (which embeds received reviews) on open. Renders an optional
 * footer (e.g. "Offer a job" / favourite) supplied by the caller.
 */
export default function CleanerProfileModal({
  cleanerId,
  onClose,
  footer,
}: {
  cleanerId: number;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [detail, setDetail] = useState<PublicCleanerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/accounts/public-cleaners/${cleanerId}/`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load this profile.");
        return (await res.json()) as PublicCleanerDetail;
      })
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cleanerId]);

  const name = detail?.display_name || "Cleaner";
  const areas = (detail?.service_areas || []).join(" · ");
  const languages = [detail?.native_language, ...(detail?.other_languages || [])]
    .filter(Boolean)
    .join(", ");
  const exp = detail ? experienceLabel(detail.experience_level) : "";

  return (
    <div className="host-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="host-modal cleaner-profile-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} profile`}
      >
        <div className="host-modal-header">
          <h2>Cleaner profile</h2>
          <button type="button" className="host-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="cleaner-profile-body">
          {loading && <div className="host-empty-state">Loading profile…</div>}
          {error && <div className="host-empty-state">{error}</div>}

          {detail && !loading && (
            <>
              <div className="cleaner-profile-hero">
                <span className="cleaner-profile-avatar" aria-hidden="true">
                  {detail.profile_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.profile_image} alt="" />
                  ) : (
                    <span>{initials(name)}</span>
                  )}
                </span>
                <div className="cleaner-profile-hero-info">
                  <h3>
                    {name}
                    {detail.kind === "agency" && (
                      <span className="cleaner-profile-card-tag">Agency</span>
                    )}
                  </h3>
                  <RatingStars
                    rating={detail.average_rating}
                    count={detail.completed_jobs_count}
                    size={16}
                  />
                  {areas && (
                    <p className="cleaner-profile-meta">
                      <MapPin size={14} aria-hidden="true" /> {areas}
                    </p>
                  )}
                  <div className="cleaner-profile-connect">
                    <ConnectButton targetUserId={detail.user_id} />
                  </div>
                </div>
              </div>

              {detail.bio && <p className="cleaner-profile-bio">{detail.bio}</p>}

              <dl className="cleaner-profile-facts">
                {exp && (
                  <div>
                    <dt>Experience</dt>
                    <dd>{exp}</dd>
                  </div>
                )}
                {languages && (
                  <div>
                    <dt>Languages</dt>
                    <dd>{languages}</dd>
                  </div>
                )}
                {detail.has_own_car && (
                  <div>
                    <dt>Transport</dt>
                    <dd>
                      <Car size={14} aria-hidden="true" /> Has own car
                    </dd>
                  </div>
                )}
              </dl>

              <div className="cleaner-profile-reviews">
                <h4>
                  Reviews
                  <span className="cleaner-profile-reviews-count">
                    {detail.reviews.length}
                  </span>
                </h4>
                {detail.reviews.length === 0 ? (
                  <p className="host-empty-state cleaner-profile-noreviews">
                    <MessageSquare size={18} aria-hidden="true" />
                    No reviews yet.
                  </p>
                ) : (
                  <ul className="review-list">
                    {detail.reviews.map((review) => (
                      <li className="review-item" key={review.id}>
                        <div className="review-item-head">
                          <strong>{review.reviewer_name}</strong>
                          <RatingStars rating={review.rating} size={13} showValue={false} />
                        </div>
                        {review.comment && <p>{review.comment}</p>}
                        <span className="review-item-date">{formatDate(review.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {footer && <div className="cleaner-profile-footer">{footer}</div>}
      </div>
    </div>
  );
}

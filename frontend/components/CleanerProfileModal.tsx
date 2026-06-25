"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Car, MapPin, MessageSquare, X } from "lucide-react";
import { apiFetch, type PublicCleanerDetail } from "../lib/api";
import RatingStars from "./RatingStars";
import ConnectButton from "./ConnectButton";

const EXPERIENCE_DISPLAY_KEYS = ["none", "1_year", "2_years", "3_years", "4_years", "5_years", "more_than_5_years"] as const;
type ExperienceDisplayKey = typeof EXPERIENCE_DISPLAY_KEYS[number];

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
  const t = useTranslations("components.cleanerProfileModal");
  const tCard = useTranslations("components.cleanerCard");
  const tED = useTranslations("components.cleanerCard.experienceDisplay");
  const [detail, setDetail] = useState<PublicCleanerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [backdropActive, setBackdropActive] = useState(false);

  // Delay the dark backdrop by one rAF so the modal card's GPU tile layer is
  // fully rasterized before we composite it over the dark background, avoiding
  // an initial "dimmed card" artifact caused by Chrome layer scheduling order.
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setBackdropActive(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setShowAllAreas(false);
    apiFetch(`/api/accounts/public-cleaners/${cleanerId}/`)
      .then(async (res) => {
        if (!res.ok) throw new Error(t("loadError"));
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
  }, [cleanerId, t]);

  const name = detail?.display_name || tCard("defaultName");
  const serviceAreas = detail?.service_areas || [];
  const visibleAreas = showAllAreas ? serviceAreas : serviceAreas.slice(0, 3);
  const languages = [detail?.native_language, ...(detail?.other_languages || [])]
    .filter(Boolean)
    .join(", ");
  const expKey = detail && EXPERIENCE_DISPLAY_KEYS.includes(detail.experience_level as ExperienceDisplayKey)
    ? (detail.experience_level as ExperienceDisplayKey)
    : "none";
  const exp = detail ? tED(expKey) : "";

  return createPortal(
    <div
      className="host-modal-shell"
      onClick={onClose}
      role="presentation"
      style={{ background: backdropActive ? "rgba(0, 0, 0, 0.48)" : "transparent" }}
    >
      <div
        className="host-modal cleaner-profile-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} profile`}
      >
        <div className="host-modal-header">
          <h2>{t("heading")}</h2>
          <button type="button" className="host-modal-close" onClick={onClose} aria-label={t("closeAriaLabel")}>
            <X size={18} />
          </button>
        </div>

        <div className="cleaner-profile-body">
          {loading && <div className="host-empty-state">{t("loadingProfile")}</div>}
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
                      <span className="cleaner-profile-card-tag">{tCard("agencyChip")}</span>
                    )}
                  </h3>
                  <RatingStars
                    rating={detail.average_rating}
                    count={detail.completed_jobs_count}
                    size={16}
                  />
                  {serviceAreas.length > 0 && (
                    <p className="cleaner-profile-meta">
                      <MapPin size={14} aria-hidden="true" /> {visibleAreas.join(" · ")}
                      {serviceAreas.length > 3 && (
                        <button
                          type="button"
                          className="cleaner-profile-areas-toggle"
                          onClick={() => setShowAllAreas((v) => !v)}
                        >
                          {showAllAreas ? t("showLess") : t("showAll", { count: serviceAreas.length })}
                        </button>
                      )}
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
                    <dt>{t("dtExperience")}</dt>
                    <dd>{exp}</dd>
                  </div>
                )}
                {languages && (
                  <div>
                    <dt>{t("dtLanguages")}</dt>
                    <dd>{languages}</dd>
                  </div>
                )}
                {detail.has_own_car && (
                  <div>
                    <dt>{t("dtTransport")}</dt>
                    <dd>
                      <Car size={14} aria-hidden="true" /> {t("ddOwnCar")}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="cleaner-profile-reviews">
                <h4>
                  {t("reviewsHeading")}
                  <span className="cleaner-profile-reviews-count">
                    {detail.reviews.length}
                  </span>
                </h4>
                {detail.reviews.length === 0 ? (
                  <p className="host-empty-state cleaner-profile-noreviews">
                    <MessageSquare size={18} aria-hidden="true" />
                    {t("noReviews")}
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
    </div>,
    document.body,
  );
}

"use client";

import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import type { PublicCleaner } from "../lib/api";
import RatingStars from "./RatingStars";

const EXPERIENCE_DISPLAY_KEYS = ["none", "1_year", "2_years", "3_years", "4_years", "5_years", "more_than_5_years"] as const;
type ExperienceDisplayKey = typeof EXPERIENCE_DISPLAY_KEYS[number];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Compact, reputation-first cleaner card. Used in the directory grid and the
 * landing "featured cleaners" gallery. Clicking it opens the profile modal.
 */
export default function CleanerProfileCard({
  cleaner,
  onOpen,
}: {
  cleaner: PublicCleaner;
  onOpen?: (cleaner: PublicCleaner) => void;
}) {
  const t = useTranslations("components.cleanerCard");
  const tED = useTranslations("components.cleanerCard.experienceDisplay");
  const name = cleaner.display_name || t("defaultName");
  const areas = (cleaner.service_areas || []).slice(0, 3).join(" · ");
  const expKey = EXPERIENCE_DISPLAY_KEYS.includes(cleaner.experience_level as ExperienceDisplayKey)
    ? (cleaner.experience_level as ExperienceDisplayKey)
    : "none";
  const exp = tED(expKey);

  return (
    <button
      type="button"
      className="cleaner-profile-card"
      onClick={() => onOpen?.(cleaner)}
    >
      <span className="cleaner-profile-card-avatar" aria-hidden="true">
        {cleaner.profile_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cleaner.profile_image} alt="" />
        ) : (
          <span className="cleaner-profile-card-initials">{initials(name)}</span>
        )}
      </span>
      <span className="cleaner-profile-card-body">
        <span className="cleaner-profile-card-name">
          {name}
          {cleaner.kind === "agency" && (
            <span className="cleaner-profile-card-tag">{t("agencyChip")}</span>
          )}
        </span>
        <RatingStars
          rating={cleaner.average_rating}
          count={cleaner.completed_jobs_count}
          size={14}
        />
        {areas && (
          <span className="cleaner-profile-card-areas">
            <MapPin size={13} aria-hidden="true" />
            {areas}
          </span>
        )}
        {exp && <span className="cleaner-profile-card-exp">{exp}</span>}
      </span>
    </button>
  );
}

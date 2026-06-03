"use client";

import { MapPin } from "lucide-react";
import type { PublicCleaner } from "../lib/api";
import RatingStars from "./RatingStars";

const EXPERIENCE_LABELS: Record<string, string> = {
  none: "No experience",
  "1_year": "1 year",
  "2_years": "2 years",
  "3_years": "3 years",
  "4_years": "4 years",
  "5_years": "5 years",
  more_than_5_years: "5+ years",
};

export function experienceLabel(value: string): string {
  return EXPERIENCE_LABELS[value] ?? "";
}

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
  const name = cleaner.display_name || "Cleaner";
  const areas = (cleaner.service_areas || []).slice(0, 3).join(" · ");
  const exp = experienceLabel(cleaner.experience_level);

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
            <span className="cleaner-profile-card-tag">Agency</span>
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
        {exp && <span className="cleaner-profile-card-exp">{exp} experience</span>}
      </span>
    </button>
  );
}

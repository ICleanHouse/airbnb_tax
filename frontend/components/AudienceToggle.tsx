"use client";

import { Search, Sparkles } from "lucide-react";

export type Audience = "host" | "cleaner";

/**
 * Landing-page audience self-select: "Find a cleaner" (hosts) vs "Find cleaning
 * work" (cleaners). Controlled — the page owns the value and syncs it to the
 * ?as= URL param so the choice is shareable and can deep-link signup.
 */
export default function AudienceToggle({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (next: Audience) => void;
}) {
  return (
    <div className="audience-toggle" role="tablist" aria-label="What are you looking for?">
      <button
        type="button"
        role="tab"
        aria-selected={value === "host"}
        className={`audience-toggle-opt${value === "host" ? " active" : ""}`}
        onClick={() => onChange("host")}
      >
        <Search size={16} aria-hidden />
        Find a cleaner
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "cleaner"}
        className={`audience-toggle-opt${value === "cleaner" ? " active" : ""}`}
        onClick={() => onChange("cleaner")}
      >
        <Sparkles size={16} aria-hidden />
        Find cleaning work
      </button>
    </div>
  );
}

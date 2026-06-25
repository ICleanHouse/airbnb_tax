"use client";

import { Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export type Audience = "host" | "cleaner";

export default function AudienceToggle({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (next: Audience) => void;
}) {
  const t = useTranslations("audienceToggle");
  return (
    <div className="audience-toggle" role="tablist" aria-label={t("ariaLabel")}>
      <button
        type="button"
        role="tab"
        aria-selected={value === "host"}
        className={`audience-toggle-opt${value === "host" ? " active" : ""}`}
        onClick={() => onChange("host")}
      >
        <Search size={16} aria-hidden />
        {t("findCleaner")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "cleaner"}
        className={`audience-toggle-opt${value === "cleaner" ? " active" : ""}`}
        onClick={() => onChange("cleaner")}
      >
        <Sparkles size={16} aria-hidden />
        {t("findWork")}
      </button>
    </div>
  );
}

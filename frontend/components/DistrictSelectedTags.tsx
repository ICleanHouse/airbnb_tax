"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { ServiceZone, SupportedLanguage } from "../types/locations";
import { zoneLabel } from "../lib/locations";

type DistrictSelectedTagsProps = {
  zones: ServiceZone[];
  selectedZoneIds: string[];
  onRemove: (zoneId: string) => void;
  language?: SupportedLanguage;
};

export default function DistrictSelectedTags({
  zones,
  selectedZoneIds,
  onRemove,
  language = "bg",
}: DistrictSelectedTagsProps) {
  const t = useTranslations("components.districtSelectedTags");
  const selected = new Set(selectedZoneIds);
  const selectedZones = zones.filter((zone) => selected.has(zone.zone_id));

  if (selectedZones.length === 0) {
    return <p className="district-selector__empty">{t("empty")}</p>;
  }

  return (
    <div className="district-selector__tags" aria-label={t("ariaLabel")}>
      {selectedZones.map((zone) => (
        <span className="district-selector__tag" key={zone.zone_id}>
          {zoneLabel(zone, language)}
          <button type="button" onClick={() => onRemove(zone.zone_id)} aria-label={t("removeAriaLabel", { name: zoneLabel(zone, language) })}>
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

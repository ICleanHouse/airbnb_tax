"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ServiceZone, SupportedLanguage } from "../types/locations";
import { zoneLabel } from "../lib/locations";

type DistrictChecklistProps = {
  zones: ServiceZone[];
  selectedZoneIds: string[];
  onChange: (nextZoneIds: string[]) => void;
  disabledZoneIds?: string[];
  language?: SupportedLanguage;
};

export default function DistrictChecklist({
  zones,
  selectedZoneIds,
  onChange,
  disabledZoneIds = [],
  language = "bg",
}: DistrictChecklistProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedZoneIds), [selectedZoneIds]);
  const disabled = useMemo(() => new Set(disabledZoneIds), [disabledZoneIds]);
  const filteredZones = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return zones;
    return zones.filter((zone) => {
      const names = [zone.name_bg, zone.name_en, ...zone.legacy_names].join(" ").toLocaleLowerCase();
      return names.includes(normalizedQuery);
    });
  }, [query, zones]);

  function toggleZone(zoneId: string) {
    if (disabled.has(zoneId)) return;
    const next = new Set(selected);
    if (next.has(zoneId)) next.delete(zoneId);
    else next.add(zoneId);
    onChange(zones.filter((zone) => next.has(zone.zone_id)).map((zone) => zone.zone_id));
  }

  return (
    <section className="district-selector__fallback" aria-label="District checklist">
      <label className="district-selector__search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search district"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="district-selector__list">
        {filteredZones.map((zone) => {
          const checked = selected.has(zone.zone_id);
          const isDisabled = disabled.has(zone.zone_id);
          return (
            <label
              className={checked ? "district-selector__zone district-selector__zone--selected" : "district-selector__zone"}
              key={zone.zone_id}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isDisabled}
                onChange={() => toggleZone(zone.zone_id)}
              />
              <span>{zoneLabel(zone, language)}</span>
            </label>
          );
        })}
        {filteredZones.length === 0 ? <p className="district-selector__empty">No districts match this search.</p> : null}
      </div>
    </section>
  );
}

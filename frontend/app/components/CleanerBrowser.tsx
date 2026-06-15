"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { apiFetch, type PublicCleaner } from "../../lib/api";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { cities } from "../../lib/cityDistricts";
import { loadServiceZones, sortDistrictsForSearch } from "../../lib/locations";
import type { ServiceZone } from "../../types/locations";
import CleanerProfileCard from "../../components/CleanerProfileCard";
import CleanerProfileModal from "../../components/CleanerProfileModal";
import JobOfferModal, { type OfferProperty } from "../../components/JobOfferModal";

/** Reverse lookup: district (zone) name → owning city label. */
const ZONE_TO_CITY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const city of cities) {
    for (const zone of city.zones) map[zone.toLowerCase()] = city.label;
  }
  return map;
})();

/** Which cities does this cleaner serve, inferred from their service areas? */
function cleanerCities(cleaner: PublicCleaner): Set<string> {
  const set = new Set<string>();
  for (const area of cleaner.service_areas || []) {
    const lower = area.trim().toLowerCase();
    // The area can be a district name...
    const fromZone = ZONE_TO_CITY[lower];
    if (fromZone) set.add(fromZone);
    // ...or the city label itself.
    const cityMatch = cities.find((c) => c.label.toLowerCase() === lower);
    if (cityMatch) set.add(cityMatch.label);
  }
  return set;
}

function cleanerMatchesZone(cleaner: PublicCleaner, zone: ServiceZone) {
  const zoneNames = new Set(
    [zone.name_bg, zone.name_en, ...zone.legacy_names].map((name) => name.trim().toLocaleLowerCase()).filter(Boolean),
  );
  return (cleaner.service_areas || []).some((area) => zoneNames.has(area.trim().toLocaleLowerCase()));
}

/**
 * Public, reputation-first cleaner directory: city + district filters over a
 * grid of profile cards. Fetches all verified+approved cleaners once and
 * filters client-side so both the landing page and /cleaners stay in sync.
 *
 * Pass `offerEnabled` on the /cleaners page to show an "Offer a job" CTA
 * inside the profile modal (host-only).
 */
export default function CleanerBrowser({ offerEnabled = false }: { offerEnabled?: boolean }) {
  const [cleaners, setCleaners] = useState<PublicCleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cityValue, setCityValue] = useState("");
  const [districtZoneId, setDistrictZoneId] = useState("");
  const [districtZones, setDistrictZones] = useState<ServiceZone[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  async function loadCleaners(silent = false) {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await apiFetch("/api/accounts/public-cleaners/");
      if (!res.ok) {
        if (!silent) setError("Could not load cleaners right now.");
        return;
      }
      const data: unknown = await res.json();
      const list = Array.isArray(data)
        ? (data as PublicCleaner[])
        : ((data as { results?: PublicCleaner[] }).results ?? []);
      setCleaners(list);
    } catch {
      if (!silent) setError("Could not load cleaners right now.");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  // Offer flow -- only used when offerEnabled=true
  const [properties, setProperties] = useState<OfferProperty[]>([]);
  const [offerCleaner, setOfferCleaner] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (!offerEnabled) return;
    apiFetch("/api/properties/properties/")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: unknown) => {
        const list = Array.isArray(data)
          ? (data as OfferProperty[])
          : ((data as { results?: OfferProperty[] }).results ?? []);
        setProperties(list);
      })
      .catch(() => { /* silently ignore -- offer button will still appear */ });
  }, [offerEnabled]);

  useEffect(() => {
    void loadCleaners();
  }, []);

  useLiveRefresh(
    () => {
      void loadCleaners(true);
    },
    {},
  );

  const selectedCity = useMemo(
    () => cities.find((c) => c.value === cityValue) ?? null,
    [cityValue],
  );
  const selectedDistrictZone = useMemo(
    () => districtZones.find((zone) => zone.zone_id === districtZoneId) ?? null,
    [districtZoneId, districtZones],
  );

  useEffect(() => {
    if (!selectedCity) {
      setDistrictZones([]);
      setLoadingDistricts(false);
      return;
    }
    let cancelled = false;
    setLoadingDistricts(true);
    void loadServiceZones(selectedCity.value).then(({ zones }) => {
      if (!cancelled) {
        setDistrictZones(sortDistrictsForSearch(zones));
        setLoadingDistricts(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCity]);

  const filtered = useMemo(() => {
    return cleaners.filter((cleaner) => {
      if (selectedCity) {
        if (!cleanerCities(cleaner).has(selectedCity.label)) return false;
      }
      if (selectedDistrictZone) {
        if (!cleanerMatchesZone(cleaner, selectedDistrictZone)) return false;
      }
      return true;
    });
  }, [cleaners, selectedCity, selectedDistrictZone]);

  return (
    <div className="cleaner-browser">
      <div className="cleaner-browser-filters">
        <label className="cleaner-browser-field">
          <span>City</span>
          <select
            value={cityValue}
            onChange={(e) => {
              setCityValue(e.target.value);
              setDistrictZoneId("");
            }}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cleaner-browser-field">
          <span>District</span>
          <select
            value={districtZoneId}
            onChange={(e) => setDistrictZoneId(e.target.value)}
            disabled={!selectedCity || loadingDistricts}
          >
            <option value="">
              {selectedCity ? "All districts" : "Pick a city first"}
            </option>
            {districtZones.map((zone) => (
              <option key={zone.zone_id} value={zone.zone_id}>
                {zone.name_bg}
              </option>
            ))}
          </select>
        </label>

        {(cityValue || districtZoneId) && (
          <button
            type="button"
            className="cleaner-browser-clear"
            onClick={() => {
              setCityValue("");
              setDistrictZoneId("");
            }}
          >
            Clear
          </button>
        )}

        {!loading && !error && (
          <span className="cleaner-browser-count">
            <MapPin size={14} aria-hidden="true" />
            {filtered.length} cleaner{filtered.length !== 1 ? "s" : ""}
            {selectedCity ? ` in ${selectedCity.label}` : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="cleaners-grid">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div className="cleaner-card-skeleton" key={n} />
          ))}
        </div>
      ) : error ? (
        <div className="host-empty-state">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="host-empty-state">
          {cleaners.length === 0
            ? "No cleaners have joined yet -- check back soon."
            : "No cleaners match these filters yet."}
        </div>
      ) : (
        <div className="cleaners-grid">
          {filtered.map((cleaner) => (
            <CleanerProfileCard
              key={cleaner.id}
              cleaner={cleaner}
              onOpen={(c) => setOpenId(c.id)}
            />
          ))}
        </div>
      )}

      {openId !== null && (
        <CleanerProfileModal
          cleanerId={openId}
          onClose={() => setOpenId(null)}
          footer={
            offerEnabled ? (
              <button
                type="button"
                className="host-offer-trigger"
                onClick={() => {
                  const cleaner = cleaners.find((c) => c.id === openId);
                  if (cleaner) {
                    setOfferCleaner({ id: cleaner.user_id, name: cleaner.display_name });
                    setOpenId(null);
                  }
                }}
              >
                Offer a job
              </button>
            ) : undefined
          }
        />
      )}

      {offerCleaner && (
        <JobOfferModal
          cleanerUserId={offerCleaner.id}
          cleanerName={offerCleaner.name}
          properties={properties}
          onClose={() => setOfferCleaner(null)}
        />
      )}
    </div>
  );
}

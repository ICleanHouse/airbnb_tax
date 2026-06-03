"use client";

export { default } from "../../components/CleanerBrowser";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { apiFetch, type PublicCleaner } from "../../lib/api";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { cities } from "../../lib/cityDistricts";
import CleanerProfileCard from "./CleanerProfileCard";
import CleanerProfileModal from "./CleanerProfileModal";
import JobOfferModal, { type OfferProperty } from "./JobOfferModal";

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
  const [district, setDistrict] = useState("");
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

  const filtered = useMemo(() => {
    return cleaners.filter((cleaner) => {
      if (selectedCity) {
        if (!cleanerCities(cleaner).has(selectedCity.label)) return false;
      }
      if (district) {
        const has = (cleaner.service_areas || []).some(
          (a) => a.trim().toLowerCase() === district.toLowerCase(),
        );
        if (!has) return false;
      }
      return true;
    });
  }, [cleaners, selectedCity, district]);

  return (
    <div className="cleaner-browser">
      <div className="cleaner-browser-filters">
        <label className="cleaner-browser-field">
          <span>City</span>
          <select
            value={cityValue}
            onChange={(e) => {
              setCityValue(e.target.value);
              setDistrict("");
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
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!selectedCity}
          >
            <option value="">
              {selectedCity ? "All districts" : "Pick a city first"}
            </option>
            {selectedCity?.zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>

        {(cityValue || district) && (
          <button
            type="button"
            className="cleaner-browser-clear"
            onClick={() => {
              setCityValue("");
              setDistrict("");
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

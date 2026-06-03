"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { apiFetch, type PublicCleaner } from "../lib/api";
import { useLiveRefresh } from "../lib/useLiveRefresh";
import { cities } from "../lib/cityDistricts";
import CleanerProfileCard from "./CleanerProfileCard";
import CleanerProfileModal from "./CleanerProfileModal";

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function cityFromValue(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return cities.find((city) => (
    normalizeText(city.value) === normalized || normalizeText(city.label) === normalized
  )) ?? null;
}

function cleanerMatchesCity(cleaner: PublicCleaner, city: (typeof cities)[number]) {
  const storedCity = cityFromValue(cleaner.city || "");
  if (storedCity) return storedCity.value === city.value;

  const selectedCityNames = new Set([normalizeText(city.value), normalizeText(city.label)]);
  const selectedCityZones = new Set(city.zones.map(normalizeText));
  return (cleaner.service_areas || []).some((area) => {
    const normalizedArea = normalizeText(area);
    return selectedCityNames.has(normalizedArea) || selectedCityZones.has(normalizedArea);
  });
}

/**
 * Public, reputation-first cleaner directory: city + district filters over a
 * grid of profile cards. Fetches all verified+approved cleaners once and
 * filters client-side so both the landing page and /cleaners stay in sync.
 */
export default function CleanerBrowser() {
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
        if (!cleanerMatchesCity(cleaner, selectedCity)) return false;
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
            ? "No cleaners have joined yet — check back soon."
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
        <CleanerProfileModal cleanerId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

"use client";
// This component is always loaded with { ssr: false } via next/dynamic.
// Leaflet requires the browser's window object, so it must not run on the server.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "../lib/api";

export interface LocationResult {
  lat: number;
  lng: number;
  address: string;
  city: string;
  neighborhood: string;
}

interface Props {
  lat: number | null;
  lng: number | null;
  city: string;
  onSelect: (result: LocationResult) => void;
}

const CITY_CENTERS: Record<string, [number, number]> = {
  Sofia: [42.6977, 23.3219],
  Plovdiv: [42.1354, 24.7453],
  Varna: [43.2141, 27.9147],
};
const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219];

interface GeocodingResponse {
  results: LocationResult[];
}

function normalizeResult(value: unknown): LocationResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const lat = candidate.latitude;
  const lng = candidate.longitude;
  const address = candidate.address;
  if (
    typeof lat !== "number" || !Number.isFinite(lat)
    || typeof lng !== "number" || !Number.isFinite(lng)
    || typeof address !== "string" || !address.trim()
  ) {
    return null;
  }
  return {
    lat,
    lng,
    address: address.trim(),
    city: typeof candidate.city === "string" ? candidate.city.trim() : "",
    neighborhood: typeof candidate.neighborhood === "string" ? candidate.neighborhood.trim() : "",
  };
}

function normalizeResults(value: unknown): LocationResult[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as GeocodingResponse).results)) return [];
  return (value as GeocodingResponse).results
    .map(normalizeResult)
    .filter((result): result is LocationResult => result !== null);
}

/** Format a provider-neutral suggestion into a primary and context line. */
function formatSuggestion(s: LocationResult): { main: string; sub: string } {
  return {
    main: s.address,
    sub: [s.neighborhood, s.city].filter(Boolean).join(", "),
  };
}

const PIN_HTML = `<span style="display:block;width:22px;height:22px;background:#ff385c;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></span>`;

export default function PropertyLocationPicker({ lat, lng, city, onSelect }: Props) {
  const t = useTranslations("components.propertyLocationPicker");
  const locale = useLocale() === "bg" ? "bg" : "en";
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapRef     = useRef<any>(null);
  const markerRef  = useRef<any>(null);
  const iconRef    = useRef<any>(null);
  const [geocoding,    setGeocoding]    = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searching,    setSearching]    = useState(false);
  const [suggestions,  setSuggestions]  = useState<LocationResult[]>([]);
  const [highlighted,  setHighlighted]  = useState(-1);
  const [lookupError, setLookupError] = useState("");

  // ── Reverse geocode on map click ──────────────────────────────────────────
  async function reverseGeocode(clickLat: number, clickLng: number) {
    setGeocoding(true);
    setLookupError("");
    try {
      const response = await apiFetch("/api/locations/geocode/reverse/", {
        method: "POST",
        body: JSON.stringify({ latitude: clickLat, longitude: clickLng, locale }),
      });
      const result = response.ok ? normalizeResults(await response.json())[0] : null;
      if (result) onSelect(result);
      else setLookupError(t("lookupUnavailable"));
    } catch {
      setLookupError(t("lookupUnavailable"));
    } finally {
      setGeocoding(false);
    }
  }

  // ── Fetch suggestions from Nominatim ─────────────────────────────────────
  async function fetchSuggestions(q: string) {
    setSearching(true);
    setLookupError("");
    try {
      const response = await apiFetch("/api/locations/geocode/search/", {
        method: "POST",
        body: JSON.stringify({ query: q, locale }),
      });
      const results = response.ok ? normalizeResults(await response.json()) : [];
      setSuggestions(results);
      setHighlighted(-1);
      if (!response.ok) setLookupError(t("lookupUnavailable"));
    } catch {
      setLookupError(t("lookupUnavailable"));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSuggestions([]);
      setHighlighted(-1);
    }
  }, [searchQuery]);

  // ── Close suggestions when clicking outside ──────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Initialise Leaflet once on mount ─────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    void import("leaflet").then((L) => {
      // The import may resolve after React Strict Mode has cleaned up this
      // effect. Only the currently active effect may initialize the container.
      if (cancelled || mapRef.current || containerRef.current !== container) return;

      leafletRef.current = L;

      const icon = L.divIcon({
        html: PIN_HTML,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        popupAnchor: [0, -24],
        className: "prop-map-pin",
      });
      iconRef.current = icon;

      const center: [number, number] =
        lat !== null && lng !== null ? [lat, lng] : CITY_CENTERS[city] ?? DEFAULT_CENTER;

      const map = L.map(container, { center, zoom: lat !== null ? 16 : 14 });
      mapRef.current = map;

      // Exact private-property coordinates never trigger a direct third-party
      // tile request. The picker remains usable as a neutral click-to-pin map;
      // address lookup goes only through the owned, authenticated API.

      if (lat !== null && lng !== null) {
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }

      map.on("click", (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng as { lat: number; lng: number };
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { icon }).addTo(map);
        }
        void reverseGeocode(clickLat, clickLng);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // Leaflet owns map lifecycle after initial mount; prop changes are handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan to city when city selection changes (only if no pin set yet) ──────
  useEffect(() => {
    if (!mapRef.current || lat !== null) return;
    const center = CITY_CENTERS[city] ?? DEFAULT_CENTER;
    mapRef.current.panTo(center);
  }, [city, lat]);

  // ── Place pin and pan map when a suggestion is picked ────────────────────
  function pickSuggestion(result: LocationResult) {
    const L    = leafletRef.current;
    const map  = mapRef.current;
    const icon = iconRef.current;
    if (L && map && icon) {
      if (markerRef.current) {
        markerRef.current.setLatLng([result.lat, result.lng]);
      } else {
        markerRef.current = L.marker([result.lat, result.lng], { icon }).addTo(map);
      }
      map.setView([result.lat, result.lng], 17);
    }
    onSelect(result);
    setSuggestions([]);
    setHighlighted(-1);
    setSearchQuery("");
  }

  // ── Keyboard navigation inside the search input ──────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    } else if (!suggestions.length) {
      return;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlighted(-1);
    }
  }

  // ── Explicit "Search": pin the best match, or fetch results if none yet ────
  function handleSearch() {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    if (suggestions.length > 0) {
      pickSuggestion(suggestions[highlighted >= 0 ? highlighted : 0]);
    } else {
      void fetchSuggestions(q);
    }
  }

  const showDropdown = suggestions.length > 0;

  return (
    <div className="prop-map-wrap" ref={wrapRef}>
      {/* Map — rendered first so it sits at the top */}
      <div ref={containerRef} className="prop-map-container" aria-label={t("mapAriaLabel")} />
      {geocoding && <p className="prop-map-status">{t("gettingAddress")}</p>}

      {/* Search — below the map; dropdown opens upward */}
      <div className="prop-map-search-wrap">
        {/* Suggestions dropdown — floats above the input */}
        {showDropdown && (
          <ul
            id="prop-map-suggestions"
            className="prop-map-suggestions"
            role="listbox"
            aria-label={t("suggestionsAriaLabel")}
          >
            {suggestions.map((s, i) => {
              const { main, sub } = formatSuggestion(s);
              return (
                <li
                  key={i}
                  id={`suggestion-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  className={`prop-map-suggestion-item${i === highlighted ? " prop-map-suggestion-item--active" : ""}`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                >
                  <span className="prop-map-suggestion-main">{main}</span>
                  {sub && sub !== main && (
                    <span className="prop-map-suggestion-sub">{sub}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Plain div, NOT a <form> — this picker renders inside the property
            modal's own <form>, and nested forms are invalid HTML (the inner one
            gets dropped, so a submit button would submit the outer form and
            close the modal). */}
        <div className="prop-map-search-row" role="search" aria-label={t("searchAriaLabel")}>
          <div className="prop-map-search-field">
            <input
              type="search"
              className="prop-map-search-input"
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={searchQuery}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="prop-map-suggestions"
              aria-activedescendant={highlighted >= 0 ? `suggestion-${highlighted}` : undefined}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {searching && <span className="prop-map-search-spinner" aria-hidden>⟳</span>}
          </div>
          <button
            type="button"
            className="prop-map-search-btn"
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 3}
          >
            {t("searchBtn")}
          </button>
        </div>

        {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
          <p className="prop-map-search-tip">{t("typeMore", { count: 3 - searchQuery.trim().length })}</p>
        )}
      </div>

      <p className="prop-map-hint">{t("hint")}</p>
      {lookupError ? <p className="prop-map-status" role="status">{lookupError}</p> : null}
      <p className="map-data-credit">
        {t("mapDataCredit")} {" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        {" · "}
        <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
          Geoapify
        </a>
      </p>
    </div>
  );
}

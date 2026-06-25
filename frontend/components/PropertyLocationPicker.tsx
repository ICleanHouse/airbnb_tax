"use client";
// This component is always loaded with { ssr: false } via next/dynamic.
// Leaflet requires the browser's window object, so it must not run on the server.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

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

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    house_number?: string;
    suburb?: string;
    city_district?: string;
    quarter?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
  };
}

function extractLocation(data: NominatimResult): LocationResult {
  const addr = data.address ?? {};
  const lat = parseFloat(data.lat);
  const lng = parseFloat(data.lon);
  const road = addr.road ?? addr.pedestrian ?? addr.footway ?? "";
  const houseNumber = addr.house_number ?? "";
  const address = road
    ? houseNumber ? `${road} ${houseNumber}` : road
    : data.display_name.split(",")[0].trim();
  const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";
  const neighborhood =
    addr.suburb ?? addr.city_district ?? addr.quarter ?? addr.neighbourhood ?? "";
  return { lat, lng, address, city, neighborhood };
}

/** Format a suggestion into a primary line and a secondary context line. */
function formatSuggestion(s: NominatimResult): { main: string; sub: string } {
  const addr = s.address ?? {};
  const road = addr.road ?? addr.pedestrian ?? addr.footway ?? "";
  const houseNumber = addr.house_number ?? "";
  const suburb =
    addr.suburb ?? addr.city_district ?? addr.quarter ?? addr.neighbourhood ?? "";
  const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";

  const main = road
    ? houseNumber ? `${road} ${houseNumber}` : road
    : s.display_name.split(",")[0].trim();
  const sub = [suburb, city].filter(Boolean).join(", ") || s.display_name;
  return { main, sub };
}

const PIN_HTML = `<span style="display:block;width:22px;height:22px;background:#ff385c;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></span>`;

const NOMINATIM_MIN_INTERVAL_MS = 1100;

export default function PropertyLocationPicker({ lat, lng, city, onSelect }: Props) {
  const t = useTranslations("components.propertyLocationPicker");
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapRef     = useRef<any>(null);
  const markerRef  = useRef<any>(null);
  const iconRef    = useRef<any>(null);
  const nominatimCacheRef = useRef<Map<string, unknown>>(new Map());
  const lastNominatimRequestAtRef = useRef(0);

  const [geocoding,    setGeocoding]    = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searching,    setSearching]    = useState(false);
  const [suggestions,  setSuggestions]  = useState<NominatimResult[]>([]);
  const [highlighted,  setHighlighted]  = useState(-1);

  async function fetchNominatim<T>(url: string): Promise<T | null> {
    const cached = nominatimCacheRef.current.get(url);
    if (cached) return cached as T;

    const now = Date.now();
    const waitMs = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimRequestAtRef.current));
    if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    lastNominatimRequestAtRef.current = Date.now();

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    nominatimCacheRef.current.set(url, data);
    return data;
  }

  // ── Reverse geocode on map click ──────────────────────────────────────────
  async function reverseGeocode(clickLat: number, clickLng: number) {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${clickLat}&lon=${clickLng}&format=json&accept-language=bg,en&addressdetails=1`;
      const data = await fetchNominatim<NominatimResult>(url);
      if (data) onSelect(extractLocation(data));
    } catch {
      // Silently ignore — user can still fill fields manually
    } finally {
      setGeocoding(false);
    }
  }

  // ── Fetch suggestions from Nominatim ─────────────────────────────────────
  async function fetchSuggestions(q: string) {
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=bg&format=json&limit=6&accept-language=bg,en&addressdetails=1`;
      const results = await fetchNominatim<NominatimResult[]>(url);
      if (results) {
        setSuggestions(results);
        setHighlighted(-1);
      }
    } catch {
      // ignore
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

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(map);

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
  function pickSuggestion(item: NominatimResult) {
    const result = extractLocation(item);
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
    // Refine the city/neighborhood from a reverse lookup at the picked point so
    // it matches what a map click there produces (search results carry coarser
    // neighborhood data than reverse geocoding).
    void refineNeighborhood(result);
  }

  // ── Reverse-lookup the picked point to fill in a precise neighborhood ─────
  async function refineNeighborhood(base: LocationResult) {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${base.lat}&lon=${base.lng}&format=json&accept-language=bg,en&addressdetails=1`;
      const data = await fetchNominatim<NominatimResult>(url);
      if (data) {
        const rev = extractLocation(data);
        onSelect({
          lat: base.lat,
          lng: base.lng,
          address: base.address || rev.address,
          city: rev.city || base.city,
          neighborhood: rev.neighborhood || base.neighborhood,
        });
      }
    } catch {
      // Keep the search result if the reverse lookup fails.
    } finally {
      setGeocoding(false);
    }
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
      <p className="map-data-credit">
        Map data and geocoding:{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
      </p>
    </div>
  );
}

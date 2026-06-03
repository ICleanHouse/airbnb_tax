"use client";
// This component is always loaded with { ssr: false } via next/dynamic.
// Leaflet requires the browser's window object, so it must not run on the server.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { DivIcon, LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";

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

const NOMINATIM_HEADERS = { "User-Agent": "HostCleaners/1.0 (hostcleaners.bg)" };
type LeafletModule = typeof import("leaflet");

export default function PropertyLocationPicker({ lat, lng, city, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef     = useRef<LeafletMap | null>(null);
  const markerRef  = useRef<Marker | null>(null);
  const iconRef    = useRef<DivIcon | null>(null);

  const [geocoding,    setGeocoding]    = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searching,    setSearching]    = useState(false);
  const [suggestions,  setSuggestions]  = useState<NominatimResult[]>([]);
  const [highlighted,  setHighlighted]  = useState(-1);

  // ── Reverse geocode on map click ──────────────────────────────────────────
  async function reverseGeocode(clickLat: number, clickLng: number) {
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${clickLat}&lon=${clickLng}&format=json&accept-language=bg,en&addressdetails=1`;
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (res.ok) {
        const data = (await res.json()) as NominatimResult;
        onSelect(extractLocation(data));
      }
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
      const res = await fetch(url, { headers: NOMINATIM_HEADERS });
      if (res.ok) {
        const results = (await res.json()) as NominatimResult[];
        setSuggestions(results);
        setHighlighted(-1);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  // ── Debounce: auto-search after 350 ms once the query has ≥ 3 chars ──────
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setHighlighted(-1);
      return;
    }
    const timer = setTimeout(() => void fetchSuggestions(q), 350);
    return () => clearTimeout(timer);
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

    void import("leaflet").then((L) => {
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

      const map = L.map(containerRef.current!, { center, zoom: lat !== null ? 16 : 14 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (lat !== null && lng !== null) {
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }

      map.on("click", (e: LeafletMouseEvent) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { icon }).addTo(map);
        }
        void reverseGeocode(clickLat, clickLng);
      });

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
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
  }

  // ── Keyboard navigation inside the search input ──────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlighted(-1);
    }
  }

  // ── Immediate search on explicit form submit ──────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length >= 3) void fetchSuggestions(q);
  }

  const showDropdown = suggestions.length > 0;

  return (
    <div className="prop-map-wrap" ref={wrapRef}>
      {/* Map — rendered first so it sits at the top */}
      <div ref={containerRef} className="prop-map-container" aria-label="Property location map" />
      {geocoding && <p className="prop-map-status">Getting address…</p>}

      {/* Search — below the map; dropdown opens upward */}
      <div className="prop-map-search-wrap">
        {/* Suggestions dropdown — floats above the input */}
        {showDropdown && (
          <ul
            id="prop-map-suggestions"
            className="prop-map-suggestions"
            role="listbox"
            aria-label="Address suggestions"
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

        <form className="prop-map-search-row" onSubmit={handleSubmit} role="search" aria-label="Address search">
          <div className="prop-map-search-field">
            <input
              type="search"
              role="combobox"
              className="prop-map-search-input"
              placeholder="Search address in Bulgaria…"
              value={searchQuery}
              autoComplete="off"
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls="prop-map-suggestions"
              aria-expanded={showDropdown}
              aria-activedescendant={highlighted >= 0 ? `suggestion-${highlighted}` : undefined}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {searching && <span className="prop-map-search-spinner" aria-hidden>⟳</span>}
          </div>
          <button type="submit" className="prop-map-search-btn" disabled={searching || searchQuery.trim().length < 3}>
            Search
          </button>
        </form>

        {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
          <p className="prop-map-search-tip">Type {3 - searchQuery.trim().length} more character{3 - searchQuery.trim().length !== 1 ? "s" : ""}…</p>
        )}
      </div>

      <p className="prop-map-hint">Click the map to pin the exact location, or search for an address below.</p>
    </div>
  );
}

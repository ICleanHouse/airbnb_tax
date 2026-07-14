"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, MapPinned } from "lucide-react";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { apiFetch } from "../lib/api";
import type { CurrentUser } from "../lib/api";
import { cities } from "../lib/cityDistricts";
import { loadZoneGeoJSON } from "../lib/locations";
import type { ZoneFeatureCollection } from "../types/locations";

interface PublicDemandZone {
  zone_id: string;
  zone_name_bg: string;
  zone_name_en: string;
  open_job_count: number;
}

interface PublicDemandCity {
  city_slug: string;
  city_name_bg: string;
  city_name_en: string;
  open_job_count: number;
  zones: PublicDemandZone[];
}

interface PublicDemandResponse {
  cities: PublicDemandCity[];
}

interface Props {
  cityLabel: string;
  cityChangeSource: "select" | "map";
  currentUser: CurrentUser | null;
  onCityChange: (cityLabel: string) => void;
}

function citySlugFromLabel(label: string): string {
  return cities.find((city) => city.label === label)?.value ?? "";
}

function isPublicDemandResponse(value: unknown): value is PublicDemandResponse {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as { cities?: unknown }).cities);
}

function flattenCoordinates(value: unknown, output: [number, number][] = []): [number, number][] {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push([value[0], value[1]]);
    return output;
  }
  for (const child of value) flattenCoordinates(child, output);
  return output;
}

function boundsFromGeoJSON(geojson: ZoneFeatureCollection): [[number, number], [number, number]] | null {
  const points = geojson.features.flatMap((feature) => flattenCoordinates(feature.geometry.coordinates));
  if (points.length === 0) return null;
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * Compatibility-named public demand component. It intentionally renders only
 * canonical city/district aggregates; job and property markers do not belong
 * on the anonymous landing surface.
 */
export default function OpenJobMap({ cityLabel }: Props) {
  const t = useTranslations("components.openJobMap");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [demand, setDemand] = useState<PublicDemandCity[]>([]);
  const [zoneGeometry, setZoneGeometry] = useState<ZoneFeatureCollection | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const citySlug = citySlugFromLabel(cityLabel);
  const where = cityLabel || t("defaultCity");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = citySlug ? `?city=${encodeURIComponent(citySlug)}` : "";

    apiFetch(`/api/marketplace/public-demand/${query}`)
      .then((response) => {
        if (!response.ok) throw new Error("public_demand_unavailable");
        return response.json();
      })
      .then((data: unknown) => {
        if (!cancelled) setDemand(isPublicDemandResponse(data) ? data.cities : []);
      })
      .catch(() => {
        if (!cancelled) {
          setDemand([]);
          setError(t("errors.loadDemandFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [citySlug, t]);

  useEffect(() => {
    let cancelled = false;
    setZoneGeometry(null);
    setMapFailed(false);

    // Only Sofia has an approved canonical geometry snapshot for this surface.
    // Other cities intentionally retain the aggregate list without a map.
    if (citySlug !== "sofia") return () => {
      cancelled = true;
    };

    loadZoneGeoJSON("sofia")
      .then((geojson) => {
        if (!cancelled && geojson?.features.length) setZoneGeometry(geojson);
      })
      .catch(() => {
        if (!cancelled) setZoneGeometry(null);
      });

    return () => {
      cancelled = true;
    };
  }, [citySlug]);

  const visibleCities = useMemo(() => (
    citySlug ? demand.filter((city) => city.city_slug === citySlug) : demand
  ), [citySlug, demand]);
  const totalJobs = visibleCities.reduce((total, city) => total + city.open_job_count, 0);
  const zones = useMemo(() => (
    visibleCities
      .flatMap((city) => city.zones)
      .sort((left, right) => (
        right.open_job_count - left.open_job_count
        || left.zone_id.localeCompare(right.zone_id, undefined, { numeric: true })
      ))
  ), [visibleCities]);
  const largestCount = Math.max(...zones.map((zone) => zone.open_job_count), 1);
  const demandGeometry = useMemo<FeatureCollection<Geometry, GeoJsonProperties> | null>(() => {
    if (!zoneGeometry) return null;
    const counts = new Map<string, number>();
    for (const zone of zones) {
      counts.set(zone.zone_id, (counts.get(zone.zone_id) ?? 0) + zone.open_job_count);
    }
    return {
      type: "FeatureCollection",
      features: zoneGeometry.features.map((feature) => ({
        ...feature,
        geometry: feature.geometry as unknown as Geometry,
        properties: {
          ...feature.properties,
          open_job_count: counts.get(feature.properties.zone_id) ?? 0,
        },
      })),
    };
  }, [zoneGeometry, zones]);
  const showMap = Boolean(
    citySlug === "sofia"
    && !loading
    && !error
    && zones.length > 0
    && demandGeometry?.features.length
    && !mapFailed
  );

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || !demandGeometry || !zoneGeometry) return;
    let cancelled = false;
    const mapData = demandGeometry;
    const boundaryGeometry = zoneGeometry;

    async function renderDemandMap() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !mapContainerRef.current) return;

        mapRef.current?.remove();
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [{
              id: "public-demand-background",
              type: "background",
              paint: { "background-color": "#f3f8f7" },
            }],
          },
          center: [23.3219, 42.6977],
          zoom: 10,
          interactive: false,
          attributionControl: false,
        });
        mapRef.current = map;

        map.on("error", () => {
          if (!cancelled) setMapFailed(true);
        });
        map.on("load", () => {
          if (cancelled) return;
          map.addSource("public-demand-zones", {
            type: "geojson",
            data: mapData,
          });
          map.addLayer({
            id: "public-demand-zone-fills",
            type: "fill",
            source: "public-demand-zones",
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "open_job_count"], 0],
                0,
                "#e7f0ef",
                1,
                "#82c7c4",
                Math.max(2, largestCount),
                "#007f83",
              ],
              "fill-opacity": 0.82,
            },
          });
          map.addLayer({
            id: "public-demand-zone-lines",
            type: "line",
            source: "public-demand-zones",
            paint: {
              "line-color": "#3d7775",
              "line-opacity": 0.72,
              "line-width": 0.9,
            },
          });
          const bounds = boundsFromGeoJSON(boundaryGeometry);
          if (bounds) map.fitBounds(bounds, { padding: 18, duration: 0 });
        });
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    }

    void renderDemandMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [demandGeometry, largestCount, showMap, zoneGeometry]);

  return (
    <section className="open-job-map-card" aria-label={t("sectionAriaLabel", { city: where })}>
      <div className="open-job-map-head">
        <div>
          <h2>{t("heading", { city: where })}</h2>
          <p>{t("approximateNotice")}</p>
        </div>
        <span className="open-job-map-count">
          <Briefcase size={14} aria-hidden />
          {loading ? t("loading") : t("jobCount", { count: totalJobs })}
        </span>
      </div>

      <div className={`public-demand-shell${showMap ? " public-demand-shell--with-map" : ""}`}>
        {loading ? <p className="open-job-map-state">{t("loadingDemand")}</p> : null}
        {!loading && error ? <p className="open-job-map-state">{error}</p> : null}
        {!loading && !error && zones.length === 0 ? (
          <p className="open-job-map-state">{t("noDemand")}</p>
        ) : null}
        {showMap ? (
          <figure className="public-demand-map-frame">
            <div
              ref={mapContainerRef}
              className="public-demand-map"
              role="img"
              aria-label={t("sectionAriaLabel", { city: where })}
            />
            <figcaption className="public-demand-map-attribution">
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © OpenStreetMap contributors
              </a>
            </figcaption>
          </figure>
        ) : null}
        {!loading && !error && zones.length > 0 ? (
          <ul className="public-demand-list">
            {zones.map((zone) => (
              <li key={zone.zone_id} className="public-demand-zone">
                <MapPinned size={18} aria-hidden />
                <span className="public-demand-zone-name">
                  {zone.zone_name_bg || zone.zone_name_en}
                </span>
                <span
                  className="public-demand-zone-bar"
                  aria-hidden="true"
                  style={{ "--demand-width": `${Math.max(12, (zone.open_job_count / largestCount) * 100)}%` } as CSSProperties}
                />
                <strong>{zone.open_job_count}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

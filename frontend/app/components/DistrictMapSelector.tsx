"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import DistrictChecklist from "./DistrictChecklist";
import DistrictSelectedTags from "./DistrictSelectedTags";
import {
  cityLabel,
  loadLocationCities,
  loadServiceZones,
  loadZoneGeoJSON,
  zoneLabel,
} from "../../lib/locations";
import type { LocationCity, ServiceZone, SupportedLanguage, ZoneFeatureCollection } from "../../types/locations";

export type DistrictMapSelectorProps = {
  citySlug: string;
  selectedZoneIds: string[];
  onChange: (nextZoneIds: string[]) => void;
  disabledZoneIds?: string[];
  mode?: "single" | "multiple";
  language?: SupportedLanguage;
  showListFallback?: boolean;
  onZonesLoaded?: (zones: ServiceZone[]) => void;
};

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

export default function DistrictMapSelector({
  citySlug,
  selectedZoneIds,
  onChange,
  disabledZoneIds = [],
  mode = "multiple",
  language = "bg",
  showListFallback = true,
  onZonesLoaded,
}: DistrictMapSelectorProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef(selectedZoneIds);
  const disabledRef = useRef(disabledZoneIds);
  const onChangeRef = useRef(onChange);
  const onZonesLoadedRef = useRef(onZonesLoaded);
  const [cities, setCities] = useState<LocationCity[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [geojson, setGeojson] = useState<ZoneFeatureCollection | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  selectedRef.current = selectedZoneIds;
  disabledRef.current = disabledZoneIds;
  onChangeRef.current = onChange;
  onZonesLoadedRef.current = onZonesLoaded;

  const disabled = useMemo(() => new Set(disabledZoneIds), [disabledZoneIds]);
  const selected = useMemo(() => new Set(selectedZoneIds), [selectedZoneIds]);
  const selectedCity = useMemo(() => cities.find((city) => city.slug === citySlug) ?? null, [cities, citySlug]);
  const visibleZoneIds = useMemo(
    () => zones.filter((zone) => !disabled.has(zone.zone_id)).map((zone) => zone.zone_id),
    [disabled, zones],
  );
  const hoveredZone = useMemo(
    () => zones.find((zone) => zone.zone_id === hoveredZoneId) ?? null,
    [hoveredZoneId, zones],
  );
  const hasMapFeatures = Boolean(geojson && geojson.features.length > 0);

  useEffect(() => {
    let active = true;
    loadLocationCities().then(({ cities: nextCities }) => {
      if (active) setCities(nextCities);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!citySlug) {
      setZones([]);
      setGeojson(null);
      onZonesLoadedRef.current?.([]);
      return;
    }

    let active = true;
    setLoading(true);
    setStatus("");
    Promise.all([loadServiceZones(citySlug), loadZoneGeoJSON(citySlug)])
      .then(([zoneResult, nextGeojson]) => {
        if (!active) return;
        setZones(zoneResult.zones);
        setGeojson(nextGeojson);
        onZonesLoadedRef.current?.(zoneResult.zones);
        setStatus(nextGeojson?.features.length ? "" : "Map boundaries are not loaded for this city yet. Use the checklist below.");
      })
      .catch(() => {
        if (active) setStatus("Could not load districts right now.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [citySlug]);

  useEffect(() => {
    if (!mapContainerRef.current || !hasMapFeatures) return;
    let cancelled = false;

    async function buildMap() {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !mapContainerRef.current || !geojson) return;

        mapRef.current?.remove();
        const center = selectedCity?.center ?? [23.3219, 42.6977];
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: "district-selector-background",
                type: "background",
                paint: { "background-color": "#f7faf9" },
              },
            ],
          },
          center,
          zoom: selectedCity?.default_zoom ?? 11,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        map.on("error", () => {
          if (!cancelled) setStatus("District map failed to render. Use the checklist below.");
        });

        map.on("load", () => {
          map.addSource("districts", {
            type: "geojson",
            data: geojson as unknown as FeatureCollection<Geometry, GeoJsonProperties>,
            promoteId: "zone_id",
          });
          map.addLayer({
            id: "district-fills",
            type: "fill",
            source: "districts",
            paint: {
              "fill-color": [
                "case",
                ["in", ["get", "zone_id"], ["literal", disabledRef.current]],
                "#d6d6d6",
                ["in", ["get", "zone_id"], ["literal", selectedRef.current]],
                "#008489",
                ["==", ["get", "zone_id"], ""],
                "#b8e4e2",
                "#eef3f2",
              ],
              "fill-opacity": [
                "case",
                ["in", ["get", "zone_id"], ["literal", selectedRef.current]],
                0.72,
                0.58,
              ],
            },
          });
          map.addLayer({
            id: "district-lines",
            type: "line",
            source: "districts",
            paint: {
              "line-color": [
                "case",
                ["in", ["get", "zone_id"], ["literal", selectedRef.current]],
                "#006c70",
                "#6a8f8d",
              ],
              "line-width": [
                "case",
                ["in", ["get", "zone_id"], ["literal", selectedRef.current]],
                2,
                1,
              ],
            },
          });
          const bounds = boundsFromGeoJSON(geojson);
          if (bounds) map.fitBounds(bounds, { padding: 28, duration: 0 });

          map.on("mousemove", "district-fills", (event: MapLayerMouseEvent) => {
            map.getCanvas().style.cursor = "pointer";
            const zoneId = String(event.features?.[0]?.properties?.zone_id ?? "");
            setHoveredZoneId(zoneId);
          });
          map.on("mouseleave", "district-fills", () => {
            map.getCanvas().style.cursor = "";
            setHoveredZoneId("");
          });
          map.on("click", "district-fills", (event: MapLayerMouseEvent) => {
            const zoneId = String(event.features?.[0]?.properties?.zone_id ?? "");
            if (!zoneId || disabledRef.current.includes(zoneId)) return;
            const next = new Set(selectedRef.current);
            if (mode === "single") {
              onChangeRef.current(next.has(zoneId) ? [] : [zoneId]);
              return;
            }
            if (next.has(zoneId)) next.delete(zoneId);
            else next.add(zoneId);
            const ordered = zones.filter((zone) => next.has(zone.zone_id)).map((zone) => zone.zone_id);
            onChangeRef.current(ordered);
          });
        });
      } catch {
        if (!cancelled) setStatus("District map failed to load. Use the checklist below.");
      }
    }

    void buildMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [citySlug, geojson, hasMapFeatures, mode, selectedCity, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("district-fills")) return;
    map.setPaintProperty("district-fills", "fill-color", [
      "case",
      ["in", ["get", "zone_id"], ["literal", disabledZoneIds]],
      "#d6d6d6",
      ["in", ["get", "zone_id"], ["literal", selectedZoneIds]],
      "#008489",
      ["==", ["get", "zone_id"], hoveredZoneId],
      "#b8e4e2",
      "#eef3f2",
    ]);
    map.setPaintProperty("district-fills", "fill-opacity", [
      "case",
      ["in", ["get", "zone_id"], ["literal", selectedZoneIds]],
      0.72,
      0.58,
    ]);
    map.setPaintProperty("district-lines", "line-color", [
      "case",
      ["in", ["get", "zone_id"], ["literal", selectedZoneIds]],
      "#006c70",
      "#6a8f8d",
    ]);
    map.setPaintProperty("district-lines", "line-width", [
      "case",
      ["in", ["get", "zone_id"], ["literal", selectedZoneIds]],
      2,
      1,
    ]);
  }, [disabledZoneIds, hoveredZoneId, selectedZoneIds]);

  function selectAll() {
    onChange(mode === "single" ? visibleZoneIds.slice(0, 1) : visibleZoneIds);
  }

  function clearAll() {
    onChange([]);
  }

  function removeZone(zoneId: string) {
    onChange(selectedZoneIds.filter((id) => id !== zoneId));
  }

  return (
    <div className="district-selector">
      <div className="district-selector__toolbar">
        <div>
          <strong>{selectedCity ? cityLabel(selectedCity, language) : "Districts"}</strong>
          <span>{selectedZoneIds.length} selected</span>
        </div>
        <div className="district-selector__actions">
          <button type="button" onClick={selectAll} disabled={visibleZoneIds.length === 0}>
            Select all
          </button>
          <button type="button" onClick={clearAll} disabled={selected.size === 0}>
            Clear all
          </button>
        </div>
      </div>

      <DistrictSelectedTags zones={zones} selectedZoneIds={selectedZoneIds} onRemove={removeZone} language={language} />

      <div className="district-selector__map-shell">
        {hasMapFeatures ? <div className="district-selector__map" ref={mapContainerRef} /> : null}
        {!hasMapFeatures ? (
          <div className="district-selector__map district-selector__map--empty">
            <p>{loading ? "Loading district map..." : status || "District map boundaries are not available yet."}</p>
          </div>
        ) : null}
        {hoveredZone ? <div className="district-selector__tooltip">{zoneLabel(hoveredZone, language)}</div> : null}
        <div className="district-selector__legend" aria-hidden="true">
          <span><i className="district-selector__swatch" /> Available</span>
          <span><i className="district-selector__swatch district-selector__swatch--selected" /> Selected</span>
        </div>
      </div>

      {status && hasMapFeatures ? <p className="district-selector__notice">{status}</p> : null}

      {showListFallback ? (
        <DistrictChecklist
          zones={zones}
          selectedZoneIds={selectedZoneIds}
          onChange={onChange}
          disabledZoneIds={disabledZoneIds}
          language={language}
        />
      ) : null}
    </div>
  );
}

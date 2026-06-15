import { apiFetch } from "./api";
import { cities as fallbackCities } from "./cityDistricts";
import { SOFIA_DISTRICT_BY_SOURCE_ID, SOFIA_DISTRICTS } from "./sofiaDistricts";
import type { LocationCity, ServiceZone, ZoneFeatureCollection, ZoneGeometry } from "../types/locations";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

type SofiaMapData = {
  zones: ServiceZone[];
  geojson: ZoneFeatureCollection;
};

let sofiaMapDataPromise: Promise<SofiaMapData> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resultList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (isRecord(payload) && Array.isArray(payload.results)) return payload.results as T[];
  return [];
}

function fallbackZoneSlug(zoneName: string, index: number): string {
  const normalized = zoneName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? `${normalized}-${index + 1}` : `zone-${index + 1}`;
}

async function loadSofiaMapData(): Promise<SofiaMapData> {
  if (!sofiaMapDataPromise) {
    sofiaMapDataPromise = apiFetch("/maps/sofia/districts.geojson")
      .then(async (response): Promise<SofiaMapData> => {
        if (!response.ok) throw new Error("Could not load Sofia district map.");
        const payload = (await response.json()) as FeatureCollection<Geometry, GeoJsonProperties>;
        if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
          throw new Error("Invalid Sofia district map.");
        }

        const zones: ServiceZone[] = [];
        const features = payload.features.map((feature) => {
          const properties = isRecord(feature.properties) ? feature.properties : {};
          const sourceId = String(properties.id ?? "");
          const district = SOFIA_DISTRICT_BY_SOURCE_ID.get(sourceId);
          if (!district) throw new Error(`Unknown Sofia district ID: ${sourceId}`);
          const rawName = String(properties.name ?? "");
          if (rawName !== district.name) {
            throw new Error(`Sofia district ${sourceId} does not match the frontend catalog.`);
          }
          const nameBg = district.name;
          const nameEn = String(properties["name:en"] ?? nameBg);
          const slug = `osm-${sourceId}`;
          const zoneId = district.id;

          zones.push({
            id: zoneId,
            city_slug: "sofia",
            slug,
            zone_id: zoneId,
            name_bg: nameBg,
            name_en: nameEn,
            zone_type: "district",
            legacy_names: [],
            center: null,
            is_active: true,
          });

          return {
            type: "Feature" as const,
            properties: {
              zone_id: zoneId,
              city_slug: "sofia",
              zone_slug: slug,
              name_bg: nameBg,
              name_en: nameEn,
              zone_type: "district",
              attribution: "© OpenStreetMap contributors",
            },
            geometry: feature.geometry as ZoneGeometry,
          };
        });

        return {
          zones,
          geojson: { type: "FeatureCollection" as const, features },
        };
      })
      .catch((error) => {
        sofiaMapDataPromise = null;
        throw error;
      });
  }
  const mapDataPromise = sofiaMapDataPromise;
  if (!mapDataPromise) throw new Error("Could not start loading Sofia district map.");
  return mapDataPromise;
}

export function cityLabel(city: LocationCity, language: "bg" | "en" = "en"): string {
  return language === "bg" ? city.name_bg : city.name_en || city.name_bg;
}

export function zoneLabel(zone: ServiceZone, language: "bg" | "en" = "bg"): string {
  return language === "en" ? zone.name_en || zone.name_bg : zone.name_bg;
}

export function sortDistrictsForSearch(zones: ServiceZone[]): ServiceZone[] {
  return [...zones].sort((left, right) =>
    left.name_bg.localeCompare(right.name_bg, "bg", { sensitivity: "base" }),
  );
}

export function fallbackLocationCities(): LocationCity[] {
  return fallbackCities.map((city) => ({
    slug: city.value,
    name_bg: city.label,
    name_en: city.label,
    country_code: "BG",
    center: null,
    default_zoom: 11,
  }));
}

export function fallbackServiceZones(citySlug: string): ServiceZone[] {
  if (citySlug === "sofia") {
    return SOFIA_DISTRICTS.map((district) => ({
      id: district.id,
      city_slug: "sofia",
      slug: `osm-${district.sourceId}`,
      zone_id: district.id,
      name_bg: district.name,
      name_en: district.name,
      zone_type: "district",
      legacy_names: [],
      center: null,
      is_active: true,
    }));
  }

  const city = fallbackCities.find((item) => item.value === citySlug);
  if (!city) return [];
  return city.zones.map((zoneName, index) => {
    const slug = fallbackZoneSlug(zoneName, index);
    return {
      id: `${city.value}:${slug}`,
      city_slug: city.value,
      slug,
      zone_id: `${city.value}:${slug}`,
      name_bg: zoneName,
      name_en: zoneName,
      zone_type: "district",
      legacy_names: [zoneName],
      center: null,
      is_active: true,
    };
  });
}

export async function loadLocationCities(): Promise<{ cities: LocationCity[]; source: "api" | "fallback" }> {
  try {
    const response = await apiFetch("/api/locations/cities/");
    if (!response.ok) throw new Error("Could not load location cities.");
    const list = resultList<LocationCity>(await response.json());
    if (list.length > 0) return { cities: list, source: "api" };
  } catch {
    // Fallback keeps profile editing usable while locations are being seeded.
  }
  return { cities: fallbackLocationCities(), source: "fallback" };
}

export async function loadServiceZones(citySlug: string): Promise<{ zones: ServiceZone[]; source: "api" | "fallback" }> {
  if (citySlug === "sofia") {
    try {
      const { zones } = await loadSofiaMapData();
      return { zones, source: "api" };
    } catch {
      return { zones: fallbackServiceZones(citySlug), source: "fallback" };
    }
  }

  try {
    const response = await apiFetch(`/api/locations/cities/${citySlug}/zones/`);
    if (!response.ok) throw new Error("Could not load service zones.");
    const list = resultList<ServiceZone>(await response.json());
    if (list.length > 0) return { zones: list, source: "api" };
  } catch {
    // Fallback keeps profile editing usable while locations are being seeded.
  }
  return { zones: fallbackServiceZones(citySlug), source: "fallback" };
}

export async function loadZoneGeoJSON(citySlug: string): Promise<ZoneFeatureCollection | null> {
  if (citySlug === "sofia") {
    try {
      return (await loadSofiaMapData()).geojson;
    } catch {
      return null;
    }
  }

  try {
    const response = await apiFetch(`/api/locations/cities/${citySlug}/zones.geojson/`);
    if (!response.ok) return null;
    const payload = (await response.json()) as ZoneFeatureCollection;
    if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) return payload;
  } catch {
    // Map gracefully falls back to the checklist.
  }
  return null;
}

export async function loadParkGeoJSON(
  citySlug: string,
): Promise<FeatureCollection<Geometry, GeoJsonProperties> | null> {
  if (citySlug !== "sofia") return null;
  try {
    const response = await apiFetch("/maps/sofia/parks.geojson");
    if (!response.ok) return null;
    const payload = (await response.json()) as FeatureCollection<Geometry, GeoJsonProperties>;
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function serviceAreaNamesToZoneIds(serviceAreas: string[], zones: ServiceZone[]): string[] {
  const normalizedAreas = new Set(serviceAreas.map((area) => area.trim().toLocaleLowerCase()).filter(Boolean));
  return zones
    .filter((zone) => {
      const names = [zone.name_bg, zone.name_en, ...zone.legacy_names];
      return names.some((name) => normalizedAreas.has(name.trim().toLocaleLowerCase()));
    })
    .map((zone) => zone.zone_id);
}

export function zoneIdsToServiceAreaNames(zoneIds: string[], zones: ServiceZone[]): string[] {
  const selected = new Set(zoneIds);
  return zones.filter((zone) => selected.has(zone.zone_id)).map((zone) => zone.name_bg);
}

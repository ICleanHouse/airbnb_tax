import { apiFetch } from "./api";
import { cities as fallbackCities } from "./cityDistricts";
import type { LocationCity, ServiceZone, ZoneFeatureCollection } from "../types/locations";

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

export function cityLabel(city: LocationCity, language: "bg" | "en" = "en"): string {
  return language === "bg" ? city.name_bg : city.name_en || city.name_bg;
}

export function zoneLabel(zone: ServiceZone, language: "bg" | "en" = "bg"): string {
  return language === "en" ? zone.name_en || zone.name_bg : zone.name_bg;
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

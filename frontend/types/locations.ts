export type SupportedLanguage = "bg" | "en";

export type LocationCity = {
  slug: string;
  name_bg: string;
  name_en: string;
  country_code: string;
  center: [number, number] | null;
  default_zoom: number;
};

export type ServiceZone = {
  id: number | string;
  city_slug: string;
  slug: string;
  zone_id: string;
  name_bg: string;
  name_en: string;
  zone_type: string;
  legacy_names: string[];
  center: [number, number] | null;
  is_active: boolean;
};

export type ServiceZoneProperties = {
  zone_id: string;
  city_slug: string;
  zone_slug: string;
  name_bg: string;
  name_en: string;
  zone_type?: string;
  attribution?: string;
};

export type ZoneGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type ZoneFeature = {
  type: "Feature";
  properties: ServiceZoneProperties;
  geometry: ZoneGeometry;
};

export type ZoneFeatureCollection = {
  type: "FeatureCollection";
  features: ZoneFeature[];
};

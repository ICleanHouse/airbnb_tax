import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DistrictMapSelector from "./DistrictMapSelector";

const locationMocks = vi.hoisted(() => ({
  loadLocationCities: vi.fn(),
  loadServiceZones: vi.fn(),
  loadZoneGeoJSON: vi.fn(),
  loadParkGeoJSON: vi.fn(),
}));
const maplibreMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  addControl: vi.fn(),
  fitBounds: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `components.districtMapSelector.${key}`,
}));
vi.mock("../lib/locations", () => ({
  ...locationMocks,
  cityLabel: (city: { name_bg: string }) => city.name_bg,
  zoneLabel: (zone: { name_bg: string }) => zone.name_bg,
}));
vi.mock("./DistrictChecklist", () => ({ default: () => null }));
vi.mock("./DistrictSelectedTags", () => ({ default: () => null }));
vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor(options: unknown) { maplibreMocks.construct(options); }
    addControl(...args: unknown[]) { maplibreMocks.addControl(...args); }
    addSource(...args: unknown[]) { maplibreMocks.addSource(...args); }
    addLayer(...args: unknown[]) { maplibreMocks.addLayer(...args); }
    fitBounds(...args: unknown[]) { maplibreMocks.fitBounds(...args); }
    getLayer() { return undefined; }
    isStyleLoaded() { return true; }
    on(event: string, ...args: unknown[]) {
      const callback = args.at(-1);
      if (event === "load" && typeof callback === "function") {
        queueMicrotask(() => (callback as () => void)());
      }
      return this;
    }
    remove() { maplibreMocks.remove(); }
  },
  NavigationControl: class {},
}));

const zone = {
  id: "sofia:osm-66",
  city_slug: "sofia",
  slug: "osm-66",
  zone_id: "sofia:osm-66",
  name_bg: "ж.к. Лозенец",
  name_en: "Lozenets",
  zone_type: "district",
  legacy_names: [],
  center: null,
  is_active: true,
};

const geometry = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    properties: {
      zone_id: zone.zone_id,
      city_slug: "sofia",
      zone_slug: zone.slug,
      name_bg: zone.name_bg,
      name_en: zone.name_en,
    },
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[23.3, 42.66], [23.34, 42.66], [23.34, 42.69], [23.3, 42.66]]],
    },
  }],
};

describe("DistrictMapSelector local GeoJSON map", () => {
  it("renders Sofia zones without a browser tile source", async () => {
    locationMocks.loadLocationCities.mockResolvedValue({
      cities: [{ slug: "sofia", name_bg: "София", name_en: "Sofia", country_code: "BG", center: [23.3219, 42.6977], default_zoom: 11 }],
    });
    locationMocks.loadServiceZones.mockResolvedValue({ zones: [zone] });
    locationMocks.loadZoneGeoJSON.mockResolvedValue(geometry);
    locationMocks.loadParkGeoJSON.mockResolvedValue(null);

    render(<DistrictMapSelector citySlug="sofia" selectedZoneIds={[]} onChange={vi.fn()} showListFallback={false} />);

    await waitFor(() => expect(maplibreMocks.construct).toHaveBeenCalled());
    const options = maplibreMocks.construct.mock.calls[0][0] as { style: { sources: Record<string, unknown> } };
    expect(options.style.sources).toEqual({});
    expect(JSON.stringify(options.style)).not.toContain("http");
    expect(maplibreMocks.addSource).toHaveBeenCalledWith("districts", expect.objectContaining({ type: "geojson" }));
  });
});

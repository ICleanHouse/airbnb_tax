import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenJobMap from "./OpenJobMap";

const apiFetchMock = vi.hoisted(() => vi.fn());
const loadZoneGeoJSONMock = vi.hoisted(() => vi.fn());
const maplibreMock = vi.hoisted(() => ({
  construct: vi.fn(),
  addLayer: vi.fn(),
  addSource: vi.fn(),
  fitBounds: vi.fn(),
  remove: vi.fn(),
}));
const translate = vi.hoisted(() => (
  (key: string) => `components.openJobMap.${key}`
));

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/locations", () => ({
  loadZoneGeoJSON: loadZoneGeoJSONMock,
}));

vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor(options: unknown) {
      maplibreMock.construct(options);
    }

    addLayer(...args: unknown[]) {
      maplibreMock.addLayer(...args);
    }

    addSource(...args: unknown[]) {
      maplibreMock.addSource(...args);
    }

    fitBounds(...args: unknown[]) {
      maplibreMock.fitBounds(...args);
    }

    on(event: string, ...args: unknown[]) {
      const candidate = args[args.length - 1];
      const callback = typeof candidate === "function" ? candidate as () => void : undefined;
      if (event === "load" && callback) queueMicrotask(callback);
      return this;
    }

    remove() {
      maplibreMock.remove();
    }
  },
}));

const sofiaGeometry = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: {
        zone_id: "sofia:osm-66",
        city_slug: "sofia",
        zone_slug: "osm-66",
        name_bg: "ж.к. Лозенец",
        name_en: "ж.к. Лозенец",
        zone_type: "district",
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [23.30, 42.66],
          [23.34, 42.66],
          [23.34, 42.69],
          [23.30, 42.66],
        ]],
      },
    },
  ],
};

const sofiaDemand = {
  cities: [
    {
      city_slug: "sofia",
      city_name_bg: "София",
      city_name_en: "Sofia",
      open_job_count: 2,
      zones: [
        {
          zone_id: "sofia:osm-66",
          zone_name_bg: "ж.к. Лозенец",
          zone_name_en: "ж.к. Лозенец",
          open_job_count: 2,
        },
      ],
    },
  ],
  address: "1 Secret Street",
  latitude: 42.123456,
  longitude: 23.123456,
  property_image: "/media/property_images/secret.jpg",
  scheduled_start: "2026-08-01T09:00:00Z",
  proposed_price: "45.00",
};

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => structuredClone(data),
  } as Response;
}

function renderMap(cityLabel = "Sofia") {
  return render(
    <OpenJobMap
      cityLabel={cityLabel}
      cityChangeSource="select"
      currentUser={null}
      onCityChange={vi.fn()}
    />,
  );
}

describe("OpenJobMap public demand privacy", () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue(jsonResponse(sofiaDemand));
    loadZoneGeoJSONMock.mockResolvedValue(structuredClone(sofiaGeometry));
  });

  it("uses only aggregate demand and canonical static geometry for the Sofia polygon view", async () => {
    renderMap();

    expect(await screen.findByText("ж.к. Лозенец")).toBeInTheDocument();
    await waitFor(() => expect(maplibreMock.addSource).toHaveBeenCalledTimes(1));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/marketplace/public-demand/?city=sofia");
    expect(loadZoneGeoJSONMock).toHaveBeenCalledTimes(1);
    expect(loadZoneGeoJSONMock).toHaveBeenCalledWith("sofia");

    const requestedPaths = apiFetchMock.mock.calls.map(([path]) => String(path));
    for (const forbiddenPath of ["open-job-locations", "/jobs/", "/applications/", "/media/"]) {
      expect(requestedPaths.some((path) => path.includes(forbiddenPath))).toBe(false);
    }

    const mapOptions = maplibreMock.construct.mock.calls[0][0] as {
      interactive: boolean;
      style: { sources: Record<string, unknown> };
    };
    expect(mapOptions.interactive).toBe(false);
    expect(mapOptions.style.sources).toEqual({});
    expect(JSON.stringify(mapOptions.style)).not.toContain("http");

    const source = maplibreMock.addSource.mock.calls[0][1] as {
      data: { features: Array<{ properties: Record<string, unknown> }> };
    };
    expect(source.data.features[0].properties).toMatchObject({
      zone_id: "sofia:osm-66",
      open_job_count: 2,
    });
    expect(JSON.stringify(source)).not.toContain("1 Secret Street");
    expect(JSON.stringify(source)).not.toContain("/media/property_images/");

    expect(screen.getByRole("img", { name: "components.openJobMap.sectionAriaLabel" })).toBeInTheDocument();
    expect(screen.queryByText("1 Secret Street")).not.toBeInTheDocument();
    expect(screen.queryByText("45.00")).not.toBeInTheDocument();
    expect(document.querySelector('img[src*="/media/"]')).toBeNull();
  });

  it("keeps non-Sofia demand useful as a list without loading Sofia geometry", async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse({
      cities: [{
        city_slug: "plovdiv",
        city_name_bg: "Пловдив",
        city_name_en: "Plovdiv",
        open_job_count: 3,
        zones: [{
          zone_id: "plovdiv:central",
          zone_name_bg: "Център",
          zone_name_en: "Central",
          open_job_count: 3,
        }],
      }],
    }));

    renderMap("Plovdiv");

    expect(await screen.findByText("Център")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/marketplace/public-demand/?city=plovdiv");
    expect(loadZoneGeoJSONMock).not.toHaveBeenCalled();
    expect(maplibreMock.construct).not.toHaveBeenCalled();
  });

  it("falls back to the aggregate list when canonical geometry is unavailable", async () => {
    loadZoneGeoJSONMock.mockResolvedValueOnce(null);

    renderMap();

    expect(await screen.findByText("ж.к. Лозенец")).toBeInTheDocument();
    expect(maplibreMock.construct).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "components.openJobMap.sectionAriaLabel" })).not.toBeInTheDocument();
  });

  it("keeps the aggregate list when the dynamic map module cannot initialize", async () => {
    maplibreMock.construct.mockImplementationOnce(() => {
      throw new Error("maplibre unavailable");
    });

    renderMap();

    expect(await screen.findByText("ж.к. Лозенец")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("img", { name: "components.openJobMap.sectionAriaLabel" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("ж.к. Лозенец")).toBeInTheDocument();
  });

  it("does not expose application actions from the anonymous demand surface", async () => {
    render(
      <OpenJobMap
        cityLabel="Sofia"
        cityChangeSource="select"
        currentUser={{ role: "cleaner" } as never}
        onCityChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
  });
});

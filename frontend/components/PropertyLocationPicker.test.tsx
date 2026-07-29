import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PropertyLocationPicker from "./PropertyLocationPicker";

const apiFetchMock = vi.hoisted(() => vi.fn());
const leafletMock = vi.hoisted(() => ({
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  map: vi.fn(() => ({
    on: vi.fn(),
    remove: vi.fn(),
    panTo: vi.fn(),
    setView: vi.fn(),
  })),
  marker: vi.fn(() => ({ addTo: vi.fn(), setLatLng: vi.fn() })),
  divIcon: vi.fn(() => ({})),
}));
const mapClickHandler = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `components.propertyLocationPicker.${key}`,
  useLocale: () => "bg",
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("leaflet", () => leafletMock);

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => structuredClone(data),
  } as Response;
}

describe("PropertyLocationPicker private geocoding boundary", () => {
  it("uses the owned Geoapify-backed endpoint for address suggestions instead of browser geocoding", async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse({
      results: [{
        latitude: 42.6977,
        longitude: 23.3219,
        address: "бул. Витоша 1",
        city: "София",
        neighborhood: "Център",
      }],
    }));
    const user = userEvent.setup();

    render(<PropertyLocationPicker lat={null} lng={null} city="Sofia" onSelect={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("components.propertyLocationPicker.searchPlaceholder"),
      "бул. Витоша",
    );
    await user.click(screen.getByRole("button", { name: "components.propertyLocationPicker.searchBtn" }));

    await screen.findByText("бул. Витоша 1");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/locations/geocode/search/", {
      method: "POST",
      body: JSON.stringify({ query: "бул. Витоша", locale: "bg" }),
    });
  });

  it("does not load a public third-party tile layer for the private picker", async () => {
    render(<PropertyLocationPicker lat={null} lng={null} city="Sofia" onSelect={vi.fn()} />);

    await waitFor(() => expect(leafletMock.map).toHaveBeenCalled());
    expect(leafletMock.tileLayer).not.toHaveBeenCalled();
  });

  it("keeps the required Geoapify attribution visible without exposing a provider key", () => {
    render(<PropertyLocationPicker lat={null} lng={null} city="Sofia" onSelect={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Geoapify" })).toHaveAttribute("href", "https://www.geoapify.com/");
    expect(document.body.textContent).not.toContain("test-geoapify-key");
  });

  it("uses the owned reverse endpoint for a private map click and preserves manual-entry fallback on 429", async () => {
    const callbacks: Record<string, (event: { latlng: { lat: number; lng: number } }) => void> = {};
    leafletMock.map.mockReturnValueOnce({
      on: vi.fn((name: string, callback: typeof mapClickHandler) => { callbacks[name] = callback; }),
      remove: vi.fn(),
      panTo: vi.fn(),
      setView: vi.fn(),
    });
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: "geocoding_daily_quota_exhausted" }) });

    render(<PropertyLocationPicker lat={null} lng={null} city="Sofia" onSelect={vi.fn()} />);
    await waitFor(() => expect(callbacks.click).toBeDefined());
    callbacks.click({ latlng: { lat: 42.6977, lng: 23.3219 } });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/api/locations/geocode/reverse/", {
      method: "POST",
      body: JSON.stringify({ latitude: 42.6977, longitude: 23.3219, locale: "bg" }),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("components.propertyLocationPicker.lookupUnavailable");
  });
});

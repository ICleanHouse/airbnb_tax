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
});

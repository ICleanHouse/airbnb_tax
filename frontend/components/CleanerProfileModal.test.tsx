import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CleanerProfileModal from "./CleanerProfileModal";

const apiFetchMock = vi.hoisted(() => vi.fn());
const translateMock = vi.hoisted(() => (key: string) => key);

vi.mock("../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("next-intl", () => ({
  useTranslations: () => translateMock,
}));
vi.mock("./ConnectButton", () => ({
  default: () => <button type="button">Connect</button>,
}));
vi.mock("./RatingStars", () => ({
  default: () => <span data-testid="rating-stars" />,
}));

describe("CleanerProfileModal", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders the authenticated safe review projection, including its tombstone label", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        public_id: "0c6f4615-3575-42ef-9329-d97584de7b15",
        display_name: "Public cleaner",
        kind: "individual",
        bio: "",
        service_areas: [],
        native_language: "",
        other_languages: [],
        experience_level: "none",
        has_own_car: false,
        average_rating: "5.00",
        completed_jobs_count: 1,
        reviews: [{
          id: 1,
          reviewer_name: "Former marketplace user",
          rating: 5,
          comment: "Public review text",
          created_at: "2026-07-29T00:00:00Z",
        }],
      }), { status: 200 }),
    );

    render(
      <CleanerProfileModal
        cleanerPublicId="0c6f4615-3575-42ef-9329-d97584de7b15"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(document.body.textContent).toContain("Former marketplace user"));
    expect(document.body.textContent).toContain("Public review text");
    expect(screen.queryByText("verifiedHostReviewer")).not.toBeInTheDocument();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/accounts/public-cleaners/0c6f4615-3575-42ef-9329-d97584de7b15/",
    ));
  });
});

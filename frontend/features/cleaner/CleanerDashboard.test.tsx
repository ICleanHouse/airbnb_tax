import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CleanerDashboard from "./CleanerDashboard";

const apiFetchMock = vi.hoisted(() => vi.fn());
const navigationState = vi.hoisted(() => ({
  pathname: "/cleaner",
  search: "",
}));
const replaceMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    const url = new URL(href, "http://localhost");
    navigationState.pathname = url.pathname;
    navigationState.search = url.search.startsWith("?") ? url.search.slice(1) : "";
  }),
);
const liveRefreshState = vi.hoisted(() => ({
  callback: null as null | (() => void),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: any; [key: string]: unknown }) => (
    <a href={href} {...(props as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="next-image">{alt}</span>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const translate = ((key: string) => `${namespace}.${key}`) as {
      (key: string): string;
      raw: (key: string) => string[];
      rich: (key: string) => string;
    };
    translate.raw = (key: string) => {
      if (key === "monthsFull") {
        return [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
      }
      if (key === "calDays") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return [];
    };
    translate.rich = (key: string) => `${namespace}.${key}`;
    return translate;
  },
}));

vi.mock("../../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../../lib/useLiveRefresh", () => ({
  useLiveRefresh: (callback: () => void) => {
    liveRefreshState.callback = callback;
  },
}));

vi.mock("../../lib/useAppdashPrefs", () => ({
  useAppdashPrefs: () => ({
    editing: false,
    cards: [],
    moveCard: vi.fn(),
    setEditing: vi.fn(),
    toggleCard: vi.fn(),
  }),
}));

vi.mock("../../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock("../../components/Connections", () => ({
  default: () => <div data-testid="connections" />,
}));

vi.mock("../../components/AppdashGrid", () => ({
  default: () => <div data-testid="appdash-grid" />,
}));

vi.mock("../../components/RatingStars", () => ({
  default: () => <div data-testid="rating-stars" />,
}));

vi.mock("../../components/AccountDeletionPanel", () => ({
  default: () => <div data-testid="account-deletion" />,
}));

vi.mock("../../components/DistrictMapSelector", () => ({
  default: () => <div data-testid="district-map-selector" />,
}));

const cleanerUser = {
  id: 15,
  email: "cleaner@example.com",
  first_name: "Mila",
  last_name: "Cleaner",
  phone_number: "+359888000001",
  preferred_language: "bg",
  role: "cleaner",
  account_status: "approved",
  is_approved: true,
  is_platform_admin: false,
};

const cleanerProfile = {
  id: 4,
  verification_status: "verified",
  bio: "",
  city: "Sofia",
  service_areas: ["Lozenets"],
  sex: "female",
  native_language: "bg",
  other_languages: [],
  personal_preferences: [],
  education: "",
  birth_date: "1990-01-01",
  age: 36,
  experience_level: "3_years",
  has_driving_license: false,
  has_own_car: false,
  profile_image: "",
  average_rating: "5.0",
  completed_jobs_count: 1,
  is_verified: true,
};

const completedAssignment = {
  id: 11,
  job: 1,
  job_title: "Checkout clean",
  job_scheduled_start: "2026-06-29T09:00:00.000Z",
  job_scheduled_end: "2026-06-29T11:00:00.000Z",
  job_status: "completed",
  job_property_name: "Flat One",
  job_property_city: "Sofia",
  job_property_neighborhood: "Lozenets",
  agreed_price: "45.00",
  assigned_at: "2026-06-28T10:00:00.000Z",
  host_completed_at: "2026-06-29T11:00:00.000Z",
  cleaner_completed_at: "2026-06-29T11:00:00.000Z",
  completed_at: "2026-06-29T11:00:00.000Z",
};

const completedJob = {
  id: 1,
  property: 3,
  property_name: "Flat One",
  property_city: "Sofia",
  property_neighborhood: "Lozenets",
  property_address: "1 Test Street",
  host: 7,
  host_name: "Host Owner",
  title: "Checkout clean",
  description: "",
  scheduled_start: "2026-06-29T09:00:00.000Z",
  scheduled_end: "2026-06-29T11:00:00.000Z",
  currency: "EUR",
  proposed_price: "45.00",
  agreed_price: "45.00",
  status: "completed",
  cleaning_instructions: "",
  assignment: completedAssignment,
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(data)),
  } as Response;
}

function mockApiFetch() {
  apiFetchMock.mockImplementation(async (url: string) => {
    switch (url) {
      case "/api/accounts/me/":
        return jsonResponse(cleanerUser);
      case "/api/accounts/cleaners/":
        return jsonResponse([cleanerProfile]);
      case "/api/marketplace/jobs/":
        return jsonResponse([completedJob]);
      case "/api/marketplace/applications/":
        return jsonResponse([]);
      case "/api/marketplace/assignments/":
        return jsonResponse([completedAssignment]);
      case "/api/feedback/reviews/":
        return jsonResponse([]);
      default:
        if (url.startsWith("/api/marketplace/calendar/")) return jsonResponse([]);
        throw new Error(`Unhandled apiFetch call: ${url}`);
    }
  });
}

describe("CleanerDashboard review modal", () => {
  beforeEach(() => {
    navigationState.pathname = "/cleaner";
    navigationState.search = "";
    liveRefreshState.callback = null;
    replaceMock.mockReset();
    replaceMock.mockImplementation((href: string) => {
      const url = new URL(href, "http://localhost");
      navigationState.pathname = url.pathname;
      navigationState.search = url.search.startsWith("?") ? url.search.slice(1) : "";
    });
    apiFetchMock.mockReset();
    mockApiFetch();
  });

  it("does not reopen a dismissed reviewJob modal after focus refresh", async () => {
    navigationState.search = "section=assignments&reviewJob=1";
    const user = userEvent.setup();
    const { container } = render(<CleanerDashboard />);

    const dialog = await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" });
    expect(container.querySelectorAll(".host-modal-backdrop")).toHaveLength(1);

    const closeButton = within(dialog).getByRole("button", { name: "components.reviewModal.closeAriaLabel" });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    });
    expect(replaceMock).toHaveBeenCalledWith("/cleaner?section=assignments", { scroll: false });

    const callsBeforeRefresh = apiFetchMock.mock.calls.length;

    await act(async () => {
      liveRefreshState.callback?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
    });
    expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    expect(container.querySelector(".host-modal-backdrop")).toBeNull();
  });
});

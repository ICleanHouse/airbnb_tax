import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HostDashboard from "./HostDashboard";

const apiFetchMock = vi.hoisted(() => vi.fn());
const navigationState = vi.hoisted(() => ({
  pathname: "/host",
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

vi.mock("next/dynamic", () => ({
  default: () => () => null,
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
      if (key === "calDays") {
        return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      }
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

vi.mock("../../components/CleanerProfileModal", () => ({
  default: () => <div data-testid="cleaner-profile-modal" />,
}));

vi.mock("../../components/JobOfferModal", () => ({
  default: () => <div data-testid="job-offer-modal" />,
}));

vi.mock("../../components/DistrictMapSelector", () => ({
  default: ({ onChange }: { onChange: (zoneIds: string[]) => void }) => (
    <div data-testid="property-service-zone-selector">
      <button type="button" onClick={() => onChange(["sofia:osm-66"])}>
        Select canonical Sofia zone
      </button>
    </div>
  ),
}));

const hostUser = {
  id: 7,
  email: "host@example.com",
  first_name: "Host",
  last_name: "Owner",
  phone_number: "+359888000000",
  preferred_language: "bg",
  role: "host",
  account_status: "approved",
  is_approved: true,
  is_platform_admin: false,
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
  cleaner: 15,
  cleaner_name: "Mila Cleaner",
  cleaner_email: "mila@example.com",
  agreed_price: "45.00",
  assigned_at: "2026-06-28T10:00:00.000Z",
  host_completed_at: "2026-06-29T11:00:00.000Z",
  cleaner_completed_at: "2026-06-29T11:00:00.000Z",
  completed_at: "2026-06-29T11:00:00.000Z",
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(data)),
  } as Response;
}

function mockApiFetch() {
  apiFetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    switch (url) {
      case "/api/accounts/me/":
        return jsonResponse(hostUser);
      case "/api/properties/properties/":
        if (options?.method === "POST") {
          return jsonResponse({
            id: 42,
            name: "Sofia Flat",
            city: "Sofia",
            neighborhood: "",
            address: "",
            latitude: null,
            longitude: null,
            description: "",
            bedrooms: null,
            square_meters: null,
            default_cleaning_duration_minutes: 120,
            default_price_eur: null,
            service_zone_id: "sofia:osm-66",
            service_zone_name_bg: "ж.к. Лозенец",
            service_zone_name_en: "ж.к. Лозенец",
            images: [],
          }, 201);
        }
        return jsonResponse([]);
      case "/api/marketplace/jobs/":
        return jsonResponse([]);
      case "/api/marketplace/applications/":
        return jsonResponse([]);
      case "/api/marketplace/assignments/":
        return jsonResponse([completedAssignment]);
      case "/api/feedback/reviews/":
        return jsonResponse([]);
      case "/api/marketplace/favourites/":
        return jsonResponse([]);
      default:
        throw new Error(`Unhandled apiFetch call: ${url}`);
    }
  });
}

describe("HostDashboard review modal", () => {
  beforeEach(() => {
    navigationState.pathname = "/host";
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

  it("does not render a modal backdrop on initial load without a review query", async () => {
    const { container } = render(<HostDashboard />);

    await screen.findByRole("button", { name: "host.topbar.jobsTab" });

    expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    expect(container.querySelector(".host-modal-backdrop")).toBeNull();
  });

  it("keeps the review modal closed after dismissing it from a reviewJob deep link and refreshing data", async () => {
    navigationState.search = "reviewJob=1";
    const user = userEvent.setup();
    const { container } = render(<HostDashboard />);

    const dialog = await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" });
    expect(container.querySelectorAll(".host-modal-backdrop")).toHaveLength(1);
    expect((await axe(container)).violations).toHaveLength(0);

    await user.click(dialog);
    expect(screen.getByRole("dialog", { name: "components.reviewModal.ariaLabel" })).toBeInTheDocument();

    const closeButton = within(dialog).getByRole("button", { name: "components.reviewModal.closeAriaLabel" });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    });
    expect(replaceMock).toHaveBeenCalledWith("/host", { scroll: false });

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

  it("does not auto-reopen the same reviewJob after focus refresh even if the query is still present", async () => {
    navigationState.search = "reviewJob=1";
    replaceMock.mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = render(<HostDashboard />);

    const dialog = await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" });
    const closeButton = within(dialog).getByRole("button", { name: "components.reviewModal.closeAriaLabel" });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    });
    expect(navigationState.search).toBe("reviewJob=1");

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

  it("ignores the first modal-trigger click immediately after the browser regains focus", async () => {
    const user = userEvent.setup();
    render(<HostDashboard />);

    const applicationsTab = await screen.findByRole("button", { name: "host.topbar.applicationsTab" });
    await user.click(applicationsTab);
    const reviewButton = await screen.findByRole("button", { name: /leaveReview/i });

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await user.click(reviewButton);
    expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await user.click(reviewButton);
    expect(await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" })).toBeInTheDocument();
  });

  it("supports backdrop and Escape dismissal without reopening the review modal", async () => {
    navigationState.search = "reviewJob=1";
    const user = userEvent.setup();
    const { unmount } = render(<HostDashboard />);

    const firstDialog = await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" });
    const backdrop = firstDialog.parentElement;
    expect(backdrop).not.toBeNull();

    await user.click(backdrop as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    });

    unmount();

    navigationState.search = "reviewJob=1";
    render(<HostDashboard />);

    await screen.findByRole("dialog", { name: "components.reviewModal.ariaLabel" });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "components.reviewModal.ariaLabel" })).not.toBeInTheDocument();
    });
    expect(navigationState.search).toBe("");
  });

  it("requires and submits a canonical Sofia service-zone id for a new property", async () => {
    const user = userEvent.setup();
    render(<HostDashboard />);

    const addPropertyButtons = await screen.findAllByRole("button", { name: "host.rail.addProperty" });
    await user.click(addPropertyButtons[0]);

    const dialog = await screen.findByRole("dialog", { name: "host.propForm.addTitle" });
    expect(within(dialog).getByTestId("property-service-zone-selector")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("host.propForm.name"), "Sofia Flat");
    await user.click(within(dialog).getByRole("button", { name: "Select canonical Sofia zone" }));
    await user.click(within(dialog).getByRole("button", { name: "host.propForm.addTitle" }));

    await waitFor(() => {
      const createCall = apiFetchMock.mock.calls.find(([, options]) => (
        options?.method === "POST"
      ));
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body));
      expect(body.service_zone_id).toBe("sofia:osm-66");
      expect(body.neighborhood).toBe("");
    });
  });
});

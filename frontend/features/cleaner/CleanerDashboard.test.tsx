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
  cleaner: cleanerUser.id,
  assigned_member: null,
  application: null,
  agreed_price: "45.00",
  assigned_at: "2026-06-28T10:00:00.000Z",
  cancelled_at: null,
  host_completed_at: "2026-06-29T11:00:00.000Z",
  cleaner_completed_at: "2026-06-29T11:00:00.000Z",
  completed_at: "2026-06-29T11:00:00.000Z",
};

const completedJob = {
  id: 1,
  access_tier: "history",
  city_slug: "sofia",
  city_name_bg: "София",
  city_name_en: "Sofia",
  zone_id: "sofia:osm-66",
  zone_name_bg: "ж.к. Лозенец",
  zone_name_en: "ж.к. Лозенец",
  host: 7,
  host_name: "Host Owner",
  scheduled_start: "2026-06-29T09:00:00.000Z",
  scheduled_end: "2026-06-29T11:00:00.000Z",
  currency: "EUR",
  proposed_price: "45.00",
  bedrooms: 2,
  square_metres: "65.0",
  agreed_price: "45.00",
  status: "completed",
  can_apply: false,
  assignment: completedAssignment,
};

const assignedAssignment = {
  ...completedAssignment,
  id: 12,
  job: 2,
  host_completed_at: null,
  cleaner_completed_at: null,
  completed_at: null,
};

const assignedJob = {
  ...completedJob,
  id: 2,
  access_tier: "assigned",
  property_name: "Flat One",
  property_address: "1 Test Street",
  property_image: "/api/properties/images/9/content/",
  status: "assigned",
  cleaning_instructions: "Use the blue key safe.",
  assignment: assignedAssignment,
};

const evaluatorJob = {
  id: 22,
  access_tier: "evaluator",
  city_slug: "sofia",
  city_name_bg: "София",
  city_name_en: "Sofia",
  zone_id: "sofia:osm-66",
  zone_name_bg: "ж.к. Лозенец",
  zone_name_en: "ж.к. Лозенец",
  scheduled_start: "2026-08-02T09:00:00.000Z",
  scheduled_end: "2026-08-02T11:00:00.000Z",
  currency: "EUR",
  proposed_price: "45.00",
  bedrooms: 2,
  square_metres: "65.0",
  status: "open",
  can_apply: true,
};

let jobsResponse: unknown[] = [completedJob];
let assignmentsResponse: unknown[] = [completedAssignment];
let calendarResponse: unknown[] = [];
let applicationsResponse: unknown[] = [];

function assignedCalendarItem() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return {
    id: "assignment:2:12",
    item_type: "assignment",
    job: 2,
    assignment: 12,
    access_tier: "assigned",
    city_slug: "sofia",
    city_name_bg: "София",
    city_name_en: "Sofia",
    zone_id: "sofia:osm-66",
    zone_name_bg: "ж.к. Лозенец",
    zone_name_en: "ж.к. Лозенец",
    scheduled_start: `${year}-${month}-18T09:00:00.000Z`,
    scheduled_end: `${year}-${month}-18T11:00:00.000Z`,
    currency: "EUR",
    proposed_price: "45.00",
    bedrooms: 2,
    square_metres: "65.0",
    status: "assigned",
    property_name: "Flat One",
    property_address: "1 Test Street",
    property_image: "/api/properties/images/9/content/",
    host: 7,
    host_name: "Host Owner",
    agreed_price: "45.00",
    cleaning_instructions: "Use the blue key safe.",
    host_completed_at: null,
    cleaner_completed_at: null,
    completed_at: null,
    can_apply: false,
    can_complete: false,
  };
}

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
        return jsonResponse(jobsResponse);
      case "/api/marketplace/applications/":
        return jsonResponse(applicationsResponse);
      case "/api/marketplace/assignments/":
        return jsonResponse(assignmentsResponse);
      case "/api/feedback/reviews/":
        return jsonResponse([]);
      default:
        if (url.startsWith("/api/marketplace/calendar/")) return jsonResponse(calendarResponse);
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
    jobsResponse = [completedJob];
    assignmentsResponse = [completedAssignment];
    calendarResponse = [];
    applicationsResponse = [];
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

  it("renders the evaluator allowlist without requiring private property fields", async () => {
    jobsResponse = [evaluatorJob];
    assignmentsResponse = [];
    const user = userEvent.setup();
    render(<CleanerDashboard />);

    const applicationsTab = await screen.findByRole("button", { name: "cleaner.topbar.applicationsTab" });
    await user.click(applicationsTab);

    expect(await screen.findByText("cleaner.apps.openJobs.jobFallback")).toBeInTheDocument();
    expect(screen.getByText(/ж\.к\. Лозенец/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cleaner.apps.openJobs.apply" })).toBeEnabled();
    expect(screen.queryByText(/property|address|host/i)).not.toBeInTheDocument();
  });

  it("does not render application or host-offer free text outside the evaluator allowlist", async () => {
    applicationsResponse = [
      {
        id: 81,
        job: evaluatorJob.id,
        job_summary: evaluatorJob,
        status: "pending",
        origin: "cleaner_applied",
        proposed_price: "50.00",
        message: "PRIVATE_APPLICATION_MESSAGE_SENTINEL",
        created_at: "2026-07-14T10:00:00.000Z",
      },
      {
        id: 82,
        job: evaluatorJob.id,
        job_summary: evaluatorJob,
        status: "pending",
        origin: "host_offered",
        proposed_price: "51.00",
        message: "PRIVATE_HOST_OFFER_MESSAGE_SENTINEL",
        created_at: "2026-07-14T11:00:00.000Z",
      },
    ];
    const user = userEvent.setup();
    render(<CleanerDashboard />);

    await user.click(await screen.findByRole("button", { name: "cleaner.topbar.applicationsTab" }));
    expect(document.body).not.toHaveTextContent("PRIVATE_APPLICATION_MESSAGE_SENTINEL");

    await user.click(screen.getByRole("button", { name: /cleaner\.topbar\.offersTab/ }));
    expect(document.body).not.toHaveTextContent("PRIVATE_HOST_OFFER_MESSAGE_SENTINEL");
  });

  it("renders completed history without operational property details", async () => {
    const user = userEvent.setup();
    const { container } = render(<CleanerDashboard />);

    await user.click(await screen.findByRole("button", { name: "cleaner.topbar.applicationsTab" }));

    expect(await screen.findByText(/ж\.к\. Лозенец/)).toBeInTheDocument();
    expect(screen.getByText("cleaner.apps.completed.badge")).toBeInTheDocument();
    expect(screen.queryByText(/Flat One|1 Test Street|blue key safe/)).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/api/properties/images/9/content/"]')).toBeNull();
  });

  it("renders assigned jobs and calendar items from the privacy-safe projections", async () => {
    jobsResponse = [assignedJob];
    assignmentsResponse = [assignedAssignment];
    calendarResponse = [assignedCalendarItem()];
    const user = userEvent.setup();
    const { container } = render(<CleanerDashboard />);

    expect(await screen.findByText("Flat One - София")).toBeInTheDocument();
    expect(screen.getByText("cleaner.apps.openJobs.jobFallback")).toBeInTheDocument();
    expect(screen.getByText("cleaner.calendar.calendarLabel.assignment")).toBeInTheDocument();
    expect(screen.queryByText("Checkout clean")).not.toBeInTheDocument();
    expect(screen.queryByText("Job #1")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("/media/property_images/");
    expect(container.querySelector('img[src="/api/properties/images/9/content/"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cleaner\.topbar\.applicationsTab/ }));

    expect(await screen.findByText("Flat One - София")).toBeInTheDocument();
    expect(screen.getByText("cleaner.calendar.statusLabel.assigned")).toBeInTheDocument();
    expect(screen.queryByText("Checkout clean")).not.toBeInTheDocument();
    expect(screen.queryByText("Job #1")).not.toBeInTheDocument();
  });
});

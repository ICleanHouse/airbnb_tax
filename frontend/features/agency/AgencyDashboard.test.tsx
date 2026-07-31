import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AgencyDashboard from "./AgencyDashboard";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("../../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("../../components/NotificationBell", () => ({ default: () => <div data-testid="notification-bell" /> }));
vi.mock("../../components/RecoveryActions", () => ({ RecoveryActions: ({ jobId }: { jobId: number }) => <div data-testid={`recovery-actions-${jobId}`} /> }));
vi.mock("../../components/CancelJobDialog", () => ({ default: ({ jobTitle }: { jobTitle: string }) => <div data-testid="cancel-job-dialog">{jobTitle}</div> }));

const agencyUser = {
  id: 7,
  role: "agency",
  agency_readiness: {
    marketplace_eligible: false,
    profile_complete: true,
    eligible_active_members_count: 0,
    blockers: ["no_eligible_active_member"],
  },
};

const profile = {
  id: 3,
  company_name: "Sofia Clean Team",
  city: "Sofia",
  service_areas: ["Lozenets"],
  description: "",
  readiness: agencyUser.agency_readiness,
};

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(data)),
  } as Response;
}

function mockApi({ ready = false, assignments = [] as unknown[], jobs = [] as unknown[] } = {}) {
  const readiness = ready
    ? { marketplace_eligible: true, profile_complete: true, eligible_active_members_count: 1, blockers: [] }
    : agencyUser.agency_readiness;
  const readyProfile = { ...profile, readiness };
  apiFetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/marketplace/applications/" && options?.method === "POST") {
      return jsonResponse({ id: 18, job: 56, status: "pending", origin: "cleaner_applied", proposed_member: null }, 201);
    }
    switch (url) {
      case "/api/accounts/me/": return jsonResponse({ ...agencyUser, agency_readiness: readiness });
      case "/api/accounts/agencies/": return jsonResponse([readyProfile]);
      case "/api/accounts/agency-memberships/": return jsonResponse(ready ? [{ id: 11, cleaner: 21, cleaner_name: "Mira", cleaner_marketplace_eligible: true, status: "active" }] : []);
      case "/api/accounts/agency-invitations/": return jsonResponse([]);
      case "/api/accounts/public-cleaners/?city=sofia":
        return jsonResponse([{ public_id: "00000000-0000-4000-8000-000000000022", display_name: "Elena", city: "Sofia", marketplace_eligible: true, email: "private@example.test" }]);
      case "/api/marketplace/applications/": return jsonResponse(ready ? [{ id: 17, job: 44, status: "pending", origin: "cleaner_applied", proposed_member: null }] : []);
      case "/api/marketplace/assignments/": return jsonResponse(assignments);
      case "/api/marketplace/jobs/": return jsonResponse(jobs);
      default:
        if (url === "/api/accounts/agencies/3/invite-cleaner/" && options?.method === "POST") return jsonResponse({}, 201);
        if (url === "/api/marketplace/applications/17/select-member/" && options?.method === "POST") return jsonResponse({});
        throw new Error(`Unhandled apiFetch call: ${url}`);
    }
  });
}

describe("AgencyDashboard", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mockApi();
  });

  it("shows readiness blockers and prevents non-ready work selection", async () => {
    const user = userEvent.setup();
    render(<AgencyDashboard />);

    expect(await screen.findByRole("heading", { name: "agency.overview.title" })).toBeInTheDocument();
    expect(screen.getByText("agency.overview.notReady")).toBeInTheDocument();
    expect(screen.getByText("agency.blockers.no_eligible_active_member")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "agency.tabs.work" }));
    expect(screen.getByText("agency.work.gated")).toBeInTheDocument();
  });

  it("uses only a public cleaner ID when sending an invitation", async () => {
    const user = userEvent.setup();
    render(<AgencyDashboard />);

    await screen.findByRole("heading", { name: "agency.overview.title" });
    await user.click(screen.getByRole("tab", { name: "agency.tabs.invitations" }));
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "agency.invitations.invite" }));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(([path]) => path === "/api/accounts/agencies/3/invite-cleaner/");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ cleaner_public_id: "00000000-0000-4000-8000-000000000022" });
    });
  });

  it("lets a ready agency select an eligible roster member and is accessible", async () => {
    mockApi({ ready: true });
    const user = userEvent.setup();
    const { container } = render(<AgencyDashboard />);

    await screen.findByRole("heading", { name: "agency.overview.title" });
    expect((await axe(container)).violations).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: "agency.tabs.work" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "agency.work.memberChoice" }), "21");
    await user.click(screen.getByRole("button", { name: "agency.work.select" }));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(([path]) => path === "/api/marketplace/applications/17/select-member/");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ member_id: 21 });
    });
  });

  it("offers cancellation for active agency work and recovery actions for cancelled history", async () => {
    mockApi({
      ready: true,
      assignments: [
        { id: 101, job: 44, job_title: "Upcoming delegated clean", job_status: "assigned", available_actions: ["cancel"] },
        { id: 102, job: 45, job_title: "Cancelled delegated clean", job_status: "cancelled", available_actions: ["report_incident", "request_replacement"] },
      ],
    });
    const user = userEvent.setup();
    render(<AgencyDashboard />);

    await screen.findByRole("heading", { name: "agency.overview.title" });
    await user.click(screen.getByRole("tab", { name: "agency.tabs.assignments" }));
    await user.click(screen.getByRole("button", { name: "agency.assignments.cancel" }));
    expect(screen.getByTestId("cancel-job-dialog")).toHaveTextContent("Upcoming delegated clean");

    await user.click(screen.getByRole("tab", { name: "agency.tabs.history" }));
    expect(screen.getByTestId("recovery-actions-45")).toBeInTheDocument();
  });

  it("lets a ready agency apply to an eligible open job without exposing private job details", async () => {
    mockApi({
      ready: true,
      jobs: [{
        id: 56,
        status: "open",
        can_apply: true,
        city_name_en: "Sofia",
        zone_name_en: "Center",
        scheduled_start: "2030-01-02T10:00:00Z",
        scheduled_end: "2030-01-02T12:00:00Z",
        currency: "EUR",
        proposed_price: "45.00",
      }],
    });
    const user = userEvent.setup();
    render(<AgencyDashboard />);

    await screen.findByRole("heading", { name: "agency.overview.title" });
    await user.click(screen.getByRole("tab", { name: "agency.tabs.discover" }));
    await user.click(screen.getByRole("button", { name: "agency.discover.apply" }));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(([path, options]) => path === "/api/marketplace/applications/" && options?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ job_id: 56 });
    });
  });
});

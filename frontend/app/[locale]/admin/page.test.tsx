import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminPage from "./page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("filter=all"),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../../lib/api", () => ({
  apiFetch: apiFetchMock,
  roleLabel: (role: string) => role,
}));

vi.mock("../../../lib/useLiveRefresh", () => ({
  useLiveRefresh: () => undefined,
}));

const admin = {
  id: 1,
  username: "admin@example.test",
  email: "admin@example.test",
  first_name: "Ada",
  last_name: "Admin",
  phone_number: "",
  preferred_language: "en",
  role: "admin",
  account_status: "approved",
  is_approved: true,
  is_platform_admin: true,
};

const pendingCleaner = {
  id: 23,
  email: "cleaner@example.test",
  first_name: "Mila",
  last_name: "Cleaner",
  phone_number: "+359888000001",
  preferred_language: "en",
  role: "cleaner",
  account_status: "pending",
  is_approved: false,
  is_platform_admin: false,
  approved_at: null,
  email_verified: true,
  phone_verified: false,
  contact_verified: true,
  fully_verified: false,
  marketplace_eligible: false,
  cleaner_marketplace_status: "pending",
  evidence_excluded: true,
  latest_decision: {
    action: "signup_initialized",
    actor: "system",
    timestamp: "2026-07-21T10:00:00Z",
    reason_category: "configuration_bypass",
  },
};

const reviewHistory = [{
  action: "account_rejected",
  actor: "admin:1",
  timestamp: "2026-07-21T10:05:00Z",
  outcome: "changed",
  reason_category: "policy_prerequisite_incomplete",
  internal_note: "Private support context",
  previous_status: "pending",
  next_status: "rejected",
}];

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verification administration", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/accounts/me/") return Promise.resolve(response(admin));
      if (url === "/api/accounts/users/") return Promise.resolve(response([pendingCleaner]));
      if (url.endsWith("/review-history/")) return Promise.resolve(response(reviewHistory));
      if (url.endsWith("/reject/")) {
        return Promise.resolve(response({
          changed: true,
          user: { ...pendingCleaner, account_status: "rejected" },
        }));
      }
      if (url.endsWith("/reconcile-verification/")) {
        return Promise.resolve(response({ changed: false, user: pendingCleaner }));
      }
      return Promise.resolve(response({}, 404));
    });
  });

  it("shows separate states and keeps private review notes behind admin history", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);

    await screen.findByText("cleaner@example.test");
    expect(screen.getByText("userRow.email")).toBeInTheDocument();
    expect(screen.getByText("userRow.phone")).toBeInTheDocument();
    expect(screen.getByText("userRow.contact")).toBeInTheDocument();
    expect(screen.getByText("userRow.marketplace")).toBeInTheDocument();
    expect(screen.getByText("userRow.full")).toBeInTheDocument();
    expect(screen.getByText("userRow.evidenceExcluded")).toBeInTheDocument();
    expect(screen.queryByText("Private support context")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify cleaner/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "userRow.history" }));
    const historyDialog = await screen.findByRole("dialog", { name: "historyDialog.title" });
    expect(within(historyDialog).getByText("Private support context")).toBeInTheDocument();
  });

  it("submits rejection with the expected state and restricted review metadata", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);

    await screen.findByText("cleaner@example.test");
    await user.click(screen.getByRole("button", { name: "userRow.reject" }));
    const dialog = screen.getByRole("dialog", { name: "decisionDialog.rejectTitle" });
    expect(within(dialog).getByRole("button", { name: "decisionDialog.cancel" })).toHaveFocus();

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "decisionDialog.reasonLabel" }),
      "operator_support",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "decisionDialog.noteLabel" }),
      "Private support context",
    );
    await user.click(within(dialog).getByRole("button", { name: "decisionDialog.confirmReject" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/accounts/users/23/reject/",
      {
        method: "POST",
        body: JSON.stringify({
          expected_status: "pending",
          reason_category: "operator_support",
          internal_note: "Private support context",
        }),
      },
    ));
  });

  it("uses reconciliation rather than the removed manual approve action", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);

    await screen.findByText("cleaner@example.test");
    await user.click(screen.getByRole("button", { name: "userRow.reconcile" }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/accounts/users/23/reconcile-verification/",
      { method: "POST" },
    ));
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).endsWith("/approve/"))).toBe(false);
  });
});

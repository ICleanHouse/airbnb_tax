import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppEntryPage from "./page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("../../../components/AccountDeletionPanel", () => ({ default: () => null }));
vi.mock("../../../components/VerificationStatusSummary", () => ({ default: () => null }));

const rejectedUser = {
  id: 1, username: "blocked", email: "blocked@example.test", first_name: "", last_name: "", phone_number: "",
  preferred_language: "en", role: "host", account_status: "rejected", is_approved: false, is_platform_admin: false,
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

describe("app entry access states", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it.each(["rejected", "suspended"])("renders the localized %s status surface without internal notes", async (account_status) => {
    const user = { ...rejectedUser, account_status };
    apiFetchMock.mockResolvedValue(response(user));
    render(<AppEntryPage />);

    const heading = await screen.findByRole("heading", { name: `statusCopy.${account_status}.title` });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByText(/private|internal/i)).not.toBeInTheDocument();
  });

  it("uses the generic account label for an unsupported persisted role response", async () => {
    apiFetchMock.mockResolvedValue(response({ ...rejectedUser, role: "unsupported" }));
    render(<AppEntryPage />);
    await screen.findByRole("heading", { name: "statusCopy.rejected.title" });
    expect(screen.getByText("roleLabels.unknown")).toBeInTheDocument();
  });

  it("shows a focused, retryable status error instead of a raw API failure", async () => {
    apiFetchMock.mockResolvedValue(response({ detail: "private failure" }, 500));
    render(<AppEntryPage />);
    const heading = await screen.findByRole("heading", { name: "loadError.heading" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("button", { name: "loadError.retry" })).toBeVisible();
    expect(screen.queryByText("private failure")).not.toBeInTheDocument();
  });

  it("keeps unauthenticated users on the semantic login and signup path", async () => {
    apiFetchMock.mockResolvedValue(response({}, 403));
    render(<AppEntryPage />);
    expect(await screen.findByRole("heading", { name: "notLoggedIn.heading" })).toBeVisible();
    expect(screen.getByRole("link", { name: "notLoggedIn.loginBtn" })).toHaveAttribute("href", "/login");
  });
});

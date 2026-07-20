import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountDeletionPanel from "./AccountDeletionPanel";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("AccountDeletionPanel", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("renders the active-obligation blocker and keeps the dialog open", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "account_deletion_blocked_active_obligations",
          detail: "safe backend detail",
          fields: {},
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<AccountDeletionPanel email="host@example.test" />);

    await user.click(screen.getByRole("button", { name: "deleteBtn" }));
    expect(screen.getByRole("button", { name: "cancelBtn" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "confirmBtn" }));

    await waitFor(() => expect(screen.getAllByText("errors.activeObligations").length).toBeGreaterThan(0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/accounts/me/", { method: "DELETE" });
  });
});


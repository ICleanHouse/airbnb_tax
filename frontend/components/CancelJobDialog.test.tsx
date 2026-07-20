import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CancelJobDialog from "./CancelJobDialog";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("CancelJobDialog", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("focuses the reason field and requires an explicit reason", async () => {
    const user = userEvent.setup();
    render(
      <CancelJobDialog jobId={12} jobTitle="Turnover" onClose={vi.fn()} onCancelled={vi.fn()} />,
    );

    expect(screen.getByLabelText("reasonLabel")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "confirm" }));

    expect(screen.getByText("errors.reasonRequired")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("uses the explicit trailing-slash action and acknowledges success", async () => {
    const user = userEvent.setup();
    const onCancelled = vi.fn();
    const onClose = vi.fn();
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 12, status: "cancelled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(
      <CancelJobDialog jobId={12} jobTitle="Turnover" onClose={onClose} onCancelled={onCancelled} />,
    );

    await user.selectOptions(screen.getByLabelText("reasonLabel"), "host_change");
    await user.type(screen.getByLabelText("noteLabel"), "Private note");
    await user.click(screen.getByRole("button", { name: "confirm" }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith({ id: 12, status: "cancelled" }));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/marketplace/jobs/12/cancel/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <CancelJobDialog jobId={12} jobTitle="Turnover" onClose={onClose} onCancelled={vi.fn()} />,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});


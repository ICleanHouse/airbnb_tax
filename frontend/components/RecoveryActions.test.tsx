import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoveryActions } from "./RecoveryActions";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("RecoveryActions", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("uses the incident just recorded when opening the replacement request", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 77 }), { status: 201 }));
    render(<RecoveryActions jobId={12} actions={["report_incident", "request_replacement"]} />);

    await user.click(screen.getByRole("button", { name: "incident" }));
    await user.type(screen.getByLabelText("privateDetails"), "The delegated member cannot attend.");
    await user.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "replacement" }));
    expect(screen.getByLabelText("incidentId")).toHaveValue("77");
  });
});

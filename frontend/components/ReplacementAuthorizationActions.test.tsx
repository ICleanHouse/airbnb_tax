import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReplacementAuthorizationActions } from "./ReplacementAuthorizationActions";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ReplacementAuthorizationActions", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("authorizes the pending request through the existing host-response action", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 44, status: "authorized" }), { status: 200 }));

    render(
      <ReplacementAuthorizationActions
        jobId={12}
        replacementRequest={{ id: 44, status: "pending_host_authorization", expires_at: "2030-01-02T12:00:00Z" }}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "authorize" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/marketplace/jobs/12/replacement-respond/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(apiFetchMock.mock.calls[0][1].body))).toEqual({
      replacement_request_id: 44,
      accept: true,
    });
  });

  it("keeps the request pending and shows a controlled error when authorization fails", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Not permitted" }), { status: 409 }));

    render(
      <ReplacementAuthorizationActions
        jobId={12}
        replacementRequest={{ id: 44, status: "pending_host_authorization", expires_at: "2030-01-02T12:00:00Z" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "decline" }));

    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "authorize" })).toBeEnabled();
    expect(JSON.parse(String(apiFetchMock.mock.calls[0][1].body))).toEqual({
      replacement_request_id: 44,
      accept: false,
    });
  });
});

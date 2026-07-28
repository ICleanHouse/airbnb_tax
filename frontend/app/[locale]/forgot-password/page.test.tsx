import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "./page";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/api", () => ({ apiFetch: apiFetchMock }));

describe("ForgotPasswordPage", () => {
  it("shows generic confirmation without exposing the submitted address", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "generic" }), { status: 200 }));
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("emailLabel"), "person@example.test");
    await user.click(screen.getByRole("button", { name: "request.submit" }));

    expect(await screen.findByText("request.success")).toBeInTheDocument();
    expect(screen.queryByText("person@example.test")).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/accounts/password-reset/request/", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("heading")).toHaveFocus();
  });
});

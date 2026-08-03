import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ResetPasswordPage from "./page";

const apiFetchMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "bg",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({ useSearchParams: useSearchParamsMock }));
vi.mock("../../../lib/api", () => ({ apiFetch: apiFetchMock }));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useSearchParamsMock.mockReset();
  });

  it("focuses a safe invalid-link state without rendering the token", () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("uid=user"));
    render(<ResetPasswordPage />);

    expect(screen.getByText("confirm.invalidHeading")).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveFocus();
    expect(screen.queryByText("user")).not.toBeInTheDocument();
  });

  it("rejects mismatched passwords before calling the API", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("uid=user&token=secret-token"));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("newPasswordLabel"), "New-password-2048!");
    await user.type(screen.getByLabelText("confirmPasswordLabel"), "different-password");
    await user.click(screen.getByRole("button", { name: "confirm.submit" }));

    expect(await screen.findByText("confirm.mismatch")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("removes reset credentials from browser history after a successful reset", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams("uid=user&token=secret-token"));
    apiFetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const replaceState = vi.spyOn(window.history, "replaceState");
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("newPasswordLabel"), "New-password-2048!");
    await user.type(screen.getByLabelText("confirmPasswordLabel"), "New-password-2048!");
    await user.click(screen.getByRole("button", { name: "confirm.submit" }));

    expect(await screen.findByText("confirm.successHeading")).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/bg/reset-password");
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveFocus();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignupPage from "./SignupPage";
import { SIGNUP_RECOVERY_KEY } from "./signupRecovery";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, custom: _custom, variants: _variants, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const translate = ((key: string) => `${namespace}.${key}`) as {
      (key: string, values?: Record<string, unknown>): string;
      raw: (key: string) => string[];
    };
    translate.raw = (key: string) => {
      if (key === "months") return Array.from({ length: 12 }, (_, index) => `Month ${index + 1}`);
      if (key === "weekdays") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return [];
    };
    return translate;
  },
}));

vi.mock("../../lib/api", () => ({ apiFetch: apiFetchMock }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>, password: string): Promise<void> {
  await user.type(screen.getByLabelText("signup.account.firstNameLabel"), "Ada");
  await user.type(screen.getByLabelText("signup.account.lastNameLabel"), "Lovelace");
  await user.type(screen.getByLabelText("signup.account.emailLabel"), "ada@example.test");
  await user.type(screen.getByLabelText("signup.account.passwordLabel"), password);
  await user.type(screen.getByLabelText("signup.account.confirmPasswordLabel"), password);
}

async function reachHostLocation(user: ReturnType<typeof userEvent.setup>, password: string): Promise<void> {
  await fillAccount(user, password);
  await user.click(screen.getByRole("button", { name: /signup\.account\.createAccount/ }));
  await screen.findByText("signup.role.heading");
  await user.click(screen.getByRole("radio", { name: /signup\.role\.host\.label/ }));
  await user.click(screen.getByRole("button", { name: "common.continue" }));
  await screen.findByText("signup.location.heading");
}

describe("SignupPage recovery privacy", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, "", "/signup");
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/accounts/signup/email-code/") {
        return Promise.resolve(jsonResponse({ email_verification_token: "in-memory-token" }));
      }
      if (path === "/api/accounts/signup/") return Promise.resolve(jsonResponse({ id: 1 }));
      return Promise.resolve(jsonResponse({}));
    });
  });

  it("never writes passwords or confirmation values to browser persistence", async () => {
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    const indexedDbOpen = vi.fn();
    vi.stubGlobal("indexedDB", { open: indexedDbOpen } as unknown as IDBFactory);
    const user = userEvent.setup();
    render(<SignupPage />);

    const passwordSecret = "Password-storage-secret-123!";
    const confirmationSecret = "Confirmation-storage-secret-456!";
    await user.type(screen.getByLabelText("signup.account.passwordLabel"), passwordSecret);
    await user.type(screen.getByLabelText("signup.account.confirmPasswordLabel"), confirmationSecret);

    await waitFor(() => {
      const storageWrites = JSON.stringify(storageSetItem.mock.calls);
      expect(storageWrites).not.toContain(passwordSecret);
      expect(storageWrites).not.toContain(confirmationSecret);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(passwordSecret);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(confirmationSecret);
    });
    expect(sessionStorage.getItem("signup_draft")).toBeNull();
    expect(localStorage).toHaveLength(0);
    expect(indexedDbOpen).not.toHaveBeenCalled();
    expect(document.cookie).not.toMatch(/Password-storage|Confirmation-storage/);
    expect(window.location.href).not.toMatch(/Password-storage|Confirmation-storage/);
    storageSetItem.mockRestore();
    vi.unstubAllGlobals();
  });

  it("sanitizes legacy state and restores with empty credentials", async () => {
    sessionStorage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify({
      step: "profile_photo",
      password: "legacy-page-password",
      confirmPassword: "legacy-page-password",
      emailVerificationToken: "legacy-page-token",
      code: "123456",
      role: "cleaner",
      city: "sofia",
      selectedZones: ["sofia:osm-1"],
      experience: "1_year",
    }));

    render(<SignupPage />);

    expect(await screen.findByText("signup.account.heading")).toBeInTheDocument();
    expect(screen.getByLabelText("signup.account.passwordLabel")).toHaveValue("");
    expect(screen.getByLabelText("signup.account.confirmPasswordLabel")).toHaveValue("");
    expect(screen.getByText("signup.recovery.restoredNotice")).toBeInTheDocument();
    const sanitized = sessionStorage.getItem(SIGNUP_RECOVERY_KEY) ?? "";
    expect(sanitized).not.toMatch(/legacy-page-password|legacy-page-token|123456/);
  });

  it("clears an obsolete verification code after a successful resend", async () => {
    let emailCodeRequests = 0;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/accounts/signup/email-code/") {
        emailCodeRequests += 1;
        return Promise.resolve(jsonResponse({}));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const user = userEvent.setup();
    render(<SignupPage />);

    await fillAccount(user, "Password-resend-secret-123!");
    await user.click(screen.getByRole("button", { name: /signup\.account\.createAccount/ }));
    const codeInput = await screen.findByLabelText("signup.confirmEmail.codeLabel");
    await user.type(codeInput, "123456");
    expect(codeInput).toHaveValue("123456");

    await user.click(screen.getByRole("button", { name: "signup.confirmEmail.resend" }));

    await waitFor(() => expect(codeInput).toHaveValue(""));
    expect(emailCodeRequests).toBe(2);
  });

  it("submits current in-memory passwords and clears recovery after success", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await reachHostLocation(user, "Password-submit-secret-123!");
    await user.selectOptions(screen.getByLabelText("signup.location.cityLabel"), "sofia");
    await user.click(screen.getByRole("button", { name: "signup.location.selectAll" }));
    await user.click(screen.getByRole("button", { name: "signup.location.createAccount" }));

    await waitFor(() => {
      const signupCall = apiFetchMock.mock.calls.find(([path]) => path === "/api/accounts/signup/");
      expect(signupCall).toBeDefined();
      const options = signupCall?.[1] as RequestInit;
      expect(JSON.parse(String(options.body))).toMatchObject({
        password: "Password-submit-secret-123!",
        password_confirm: "Password-submit-secret-123!",
        email_verification_token: "in-memory-token",
      });
      expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();
    });
  });

  it("start-over and cancellation clear recovery state", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await reachHostLocation(user, "Password-reset-secret-123!");
    await waitFor(() => expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "signup.recovery.startOver" }));
    expect(await screen.findByText("signup.account.heading")).toBeInTheDocument();
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();
    expect(screen.getByLabelText("signup.account.passwordLabel")).toHaveValue("");

    sessionStorage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify({ role: "host" }));
    await user.click(screen.getByRole("link", { name: /signup\.brandName/ }));
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();
  });
});

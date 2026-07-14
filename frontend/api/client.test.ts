import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, sanitizeEndpointTemplate } from "./client";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

describe("apiFetch privacy controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.replaceState({}, "", "/signup?password=route-password-secret");
  });

  it("forces no-store and reports only a sanitized endpoint template", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await apiFetch("/api/marketplace/jobs/481/?address=exact-address-secret", {
      cache: "force-cache",
      headers: { "X-Request-ID": "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/marketplace/jobs/481/?address=exact-address-secret",
      expect.objectContaining({ cache: "no-store", credentials: "include" }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith("API request failed", {
      level: "error",
      extra: {
        endpoint_template: "/api/marketplace/jobs/:id/",
        error_code: "http_error",
        method: "GET",
        request_id: "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status_code: 500,
      },
    });
    const telemetry = JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls);
    expect(telemetry).not.toMatch(/481|exact-address-secret|route-password-secret|force-cache/);
  });

  it("does not send a raw network error or caller-controlled request ID", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network-password-secret"));

    await expect(
      apiFetch("https://example.test/api/accounts/users/private-user@example.test/?token=query-secret", {
        headers: { "X-Request-ID": "password-secret-sentinel" },
      }),
    ).rejects.toThrow("network-password-secret");

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "API request failed",
      expect.objectContaining({
        level: "error",
        extra: expect.objectContaining({
          endpoint_template: "/api/accounts/users/:value/",
          error_code: "network_error",
          method: "GET",
        }),
      }),
    );
    const telemetry = JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls);
    expect(telemetry).not.toMatch(/network-password-secret|password-secret-sentinel|private-user@example\.test|query-secret|example\.test/);
  });

  it("normalizes IDs, opaque values, queries, fragments, and absolute origins", () => {
    expect(sanitizeEndpointTemplate("/api/properties/images/42/content/?token=secret#fragment")).toBe(
      "/api/properties/images/:id/content/",
    );
    expect(sanitizeEndpointTemplate("https://api.example.test/api/accounts/confirm-email/abc123/opaque.token/value/")).toBe(
      "/api/accounts/confirm-email/:value/:value/:value/",
    );
    expect(sanitizeEndpointTemplate("not a url with exact address 1")).toBe("/:value");
  });
});

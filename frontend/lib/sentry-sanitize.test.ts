import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { dropSentryTransaction, sanitizeSentryEvent } from "./sentry-sanitize";

describe("sanitizeSentryEvent", () => {
  it("removes bodies, queries, user text, credentials, exact addresses, and private IDs", () => {
    const secret = "password-secret-sentinel";
    const event = {
      message: `Server rejected ${secret}`,
      logentry: { message: `Structured log ${secret}`, params: [secret] },
      transaction: "/api/jobs/981/private-address",
      user: { id: "private-user-44", email: "private@example.test", username: "Private Host" },
      request: {
        method: "POST",
        url: `https://example.test/api/marketplace/jobs/981/?password=${secret}`,
        query_string: `password=${secret}`,
        data: { password: secret },
        cookies: { sessionid: secret },
        headers: { Authorization: secret, "X-Private": secret },
      },
      exception: {
        values: [{
          type: `PrivateError-${secret}`,
          value: `Exact address ${secret}`,
          mechanism: { type: "generic", data: { message: secret } },
          stacktrace: {
            frames: [{
              filename: `https://example.test/_next/app.js?token=${secret}`,
              abs_path: `C:/private/${secret}/app.js`,
              function: "submitSignup",
              lineno: 42,
              colno: 7,
              vars: { password: secret },
              context_line: `throw new Error("${secret}")`,
            }],
          },
        }],
      },
      stacktrace: { frames: [{ filename: `/private/${secret}.js`, vars: { token: secret } }] },
      threads: { values: [{ name: secret, stacktrace: { frames: [{ filename: secret }] } }] },
      breadcrumbs: [{ category: "fetch", message: secret, data: { url: `/private/${secret}` } }],
      extra: {
        endpoint_template: "/api/marketplace/jobs/981/",
        error_code: "http_error",
        method: "POST",
        request_id: "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status_code: 403,
        detail: secret,
        job_id: 981,
      },
      contexts: { response: { body: secret, address: "1 Private Street" } },
      tags: { error_code: "http_error", user_id: "private-user-44", unsafe: secret },
    } as unknown as ErrorEvent;

    const sanitized = sanitizeSentryEvent(event, {});
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toMatch(new RegExp(`${secret}|private@example|Private Host|981|Private Street|private-user-44`));
    expect(sanitized?.extra).toEqual({
      endpoint_template: "/api/marketplace/jobs/:id/",
      error_code: "http_error",
      method: "POST",
      request_id: "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status_code: 403,
    });
    expect(sanitized?.tags).toEqual({ error_code: "http_error" });
    expect(sanitized?.request).toEqual({ method: "POST", url: "/api/marketplace/jobs/:id/" });
  });

  it("rebuilds events from an explicit top-level allowlist", () => {
    const sentinel = "ARBITRARY_TOP_LEVEL_PRIVATE_SENTINEL";
    const event = {
      message: "API request failed",
      sdk: { integrations: [sentinel] },
      dist: sentinel,
      release: sentinel,
      environment: sentinel,
      errors: [{ message: sentinel }],
      unknown_future_field: { nested: sentinel },
      extra: {
        endpoint_template: "/api/marketplace/public-demand/?secret=value",
        error_code: "http_error",
        ignored: sentinel,
      },
    } as unknown as ErrorEvent;

    const sanitized = sanitizeSentryEvent(event, {});

    expect(JSON.stringify(sanitized)).not.toContain(sentinel);
    expect(sanitized).toEqual({
      message: "API request failed",
      extra: {
        endpoint_template: "/api/marketplace/public-demand/",
        error_code: "http_error",
      },
    });
  });
});

describe("dropSentryTransaction", () => {
  it("drops performance spans that can carry raw URLs or arbitrary data", () => {
    expect(dropSentryTransaction()).toBeNull();
  });
});

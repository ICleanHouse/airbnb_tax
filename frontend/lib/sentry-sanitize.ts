import type { ErrorEvent, EventHint } from "@sentry/nextjs";

import { sanitizeEndpointTemplate } from "../api/client";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const SAFE_ERROR_CODES = new Set(["http_error", "network_error"]);
const SAFE_REQUEST_ID = /^req_[0-9a-f]{32}$/;

function safeMethod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const method = value.toUpperCase();
  return SAFE_HTTP_METHODS.has(method) ? method : undefined;
}

function safeErrorCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_ERROR_CODES.has(value) ? value : undefined;
}

function safeStatusCode(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value) ? value : undefined;
}

function safeExtra(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number> = {};

  if (typeof source.endpoint_template === "string") {
    result.endpoint_template = sanitizeEndpointTemplate(source.endpoint_template);
  }
  const errorCode = safeErrorCode(source.error_code);
  if (errorCode) result.error_code = errorCode;
  const method = safeMethod(source.method);
  if (method) result.method = method;
  const requestId = safeRequestId(source.request_id);
  if (requestId) result.request_id = requestId;
  const statusCode = safeStatusCode(source.status_code);
  if (statusCode) result.status_code = statusCode;

  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const sanitized: ErrorEvent = {
    type: undefined,
    message: event.message === "API request failed" ? "API request failed" : "Application error",
  };

  if (event.request) {
    const method = safeMethod(event.request.method);
    const url = typeof event.request.url === "string"
      ? sanitizeEndpointTemplate(event.request.url)
      : undefined;
    sanitized.request = {
      ...(method ? { method } : {}),
      ...(url ? { url } : {}),
    };
  }

  sanitized.extra = safeExtra(event.extra) as typeof sanitized.extra;
  const errorCode = safeErrorCode(event.tags?.error_code);
  sanitized.tags = errorCode ? { error_code: errorCode } : undefined;

  return sanitized;
}

/**
 * Performance transactions contain framework-generated URLs, span descriptions,
 * and arbitrary span data that do not fit the release telemetry allowlist.
 * Keep them disabled even if a deployment accidentally enables trace sampling.
 */
export function dropSentryTransaction(): null {
  return null;
}

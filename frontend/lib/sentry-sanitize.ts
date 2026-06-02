import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Sentry `beforeSend` hook. Strips PII before any event leaves the browser or
 * server so we never ship emails, phone numbers, auth tokens, or cookies to
 * Sentry — matching the platform rule that only safe fields are ever exposed.
 */

const SENSITIVE_HEADERS = ["cookie", "authorization", "x-csrftoken", "x-xsrf-token"];
const SENSITIVE_KEY_PATTERN = /pass|token|secret|authorization|cookie|csrf|email|phone|birth/i;

function scrubRecord(record: Record<string, unknown> | undefined): void {
  if (!record) return;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      record[key] = "[redacted]";
    }
  }
}

export function sanitizeSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Drop user identifiers beyond an opaque id.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete (event.user as Record<string, unknown>).username;
  }

  const request = event.request;
  if (request) {
    // Remove sensitive request headers.
    if (request.headers) {
      for (const header of Object.keys(request.headers)) {
        if (SENSITIVE_HEADERS.includes(header.toLowerCase())) {
          delete request.headers[header];
        }
      }
    }
    // Never ship cookies or raw bodies.
    delete request.cookies;
    delete request.data;
    // Strip query strings that may carry tokens.
    if (typeof request.query_string === "string") {
      delete request.query_string;
    }
  }

  // Scrub flagged keys from extra context and tags.
  scrubRecord(event.extra);
  scrubRecord(event.tags as Record<string, unknown> | undefined);

  return event;
}

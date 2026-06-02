import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const REDACTED = "[redacted]";
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-csrftoken", "x-xsrf-token"]);
const SENSITIVE_KEYS = new Set([
  "authorization",
  "code",
  "cookie",
  "csrf",
  "email_verification_token",
  "password",
  "password_confirm",
  "phone",
  "secret",
  "session",
  "token",
]);
const SENSITIVE_SUBSTRINGS = [
  "authorization",
  "cookie",
  "csrf",
  "email",
  "password",
  "phone",
  "secret",
  "session",
  "token",
  "birth",
];

function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith("_token") ||
    normalized.endsWith("_password") ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("verification_code") ||
    SENSITIVE_SUBSTRINGS.some((sensitive) => normalized.includes(sensitive))
  );
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        shouldRedact(key) ? REDACTED : scrubValue(item),
      ]),
    );
  }

  return value;
}

export function sanitizeSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete (event.user as Record<string, unknown>).username;
  }

  if (event.request) {
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(header.toLowerCase()) || shouldRedact(header)) {
          delete event.request.headers[header];
        }
      }

      event.request.headers = scrubValue(event.request.headers) as typeof event.request.headers;
    }

    delete event.request.cookies;
    delete event.request.data;

    if (typeof event.request.query_string === "string") {
      delete event.request.query_string;
    }
  }

  event.extra = scrubValue(event.extra) as typeof event.extra;
  event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  event.tags = scrubValue(event.tags as Record<string, unknown> | undefined) as typeof event.tags;

  return event;
}

import * as Sentry from "@sentry/nextjs";

import type { UserRole } from "../types/user";

const ROLE_LABELS: Record<UserRole, string> = {
  host: "Property owner",
  cleaner: "Cleaner",
  agency: "Agency",
  admin: "Admin",
};

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const SAFE_ENDPOINT_SEGMENTS = new Set([
  "accept",
  "accept-offer",
  "accounts",
  "agencies",
  "agency-invitations",
  "agency-memberships",
  "api",
  "applications",
  "approve",
  "area-stats",
  "assign-member",
  "assignments",
  "batches",
  "calendar",
  "calendar-connections",
  "calendars",
  "cities",
  "cleaners",
  "complete",
  "confirm-email",
  "connections",
  "content",
  "cookie-consent",
  "csrf",
  "decline",
  "decline-offer",
  "districts.geojson",
  "email-code",
  "favourites",
  "feedback",
  "fetch-ics-url",
  "hosts",
  "images",
  "jobs",
  "locations",
  "login",
  "logout",
  "maps",
  "mark_read",
  "marketplace",
  "me",
  "messages",
  "notifications",
  "offer-to-cleaner",
  "open-job-locations",
  "parks.geojson",
  "parse-ics",
  "properties",
  "public-cleaners",
  "public-demand",
  "publish",
  "read-all",
  "reject",
  "reservations",
  "reviews",
  "shared",
  "signup",
  "sofia",
  "unread-count",
  "users",
  "verify-email-code",
  "withdraw",
  "zones",
  "zones.geojson",
]);

function getCookie(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }

  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`))
      ?.split("=")[1] ?? ""
  );
}

function createRequestId(): string {
  const cryptoApi = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `req_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  return `req_${Array.from(
    { length: 32 },
    () => Math.floor(Math.random() * 16).toString(16),
  ).join("")}`;
}

function safeRequestId(value: string | null): string {
  const normalized = (value ?? "").trim();
  if (/^req_[0-9a-f]{32}$/.test(normalized)) return normalized;
  return createRequestId();
}

function safeMethod(value: string): string {
  const normalized = value.toUpperCase();
  return SAFE_HTTP_METHODS.has(normalized) ? normalized : "OTHER";
}

export function sanitizeEndpointTemplate(path: string): string {
  let pathname: string;
  try {
    pathname = new URL(path, "http://telemetry.invalid").pathname;
  } catch {
    return "/:value";
  }

  const hasTrailingSlash = pathname.endsWith("/");
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((rawSegment) => {
      let segment = rawSegment;
      try {
        segment = decodeURIComponent(rawSegment);
      } catch {
        return ":value";
      }
      if (/^\d+$/.test(segment)) return ":id";
      if (SAFE_ENDPOINT_SEGMENTS.has(segment.toLowerCase())) return segment.toLowerCase();
      return ":value";
    });

  if (segments.length === 0) return "/";
  return `/${segments.join("/")}${hasTrailingSlash ? "/" : ""}`;
}

function reportApiFailure({
  path,
  method,
  requestId,
  status,
  errorCode,
}: {
  path: string;
  method: string;
  requestId: string;
  status?: number;
  errorCode: "http_error" | "network_error";
}): void {
  const context: Record<string, string | number> = {
    endpoint_template: sanitizeEndpointTemplate(path),
    error_code: errorCode,
    method: safeMethod(method),
    request_id: requestId,
  };
  if (typeof status === "number") context.status_code = status;

  Sentry.captureMessage("API request failed", {
    level: errorCode === "network_error" || (status !== undefined && status >= 500) ? "error" : "warning",
    extra: context,
  });
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = safeMethod(options.method ?? "GET");
  const headers = new Headers(options.headers);
  const requestId = safeRequestId(headers.get("X-Request-ID"));

  headers.set("X-Request-ID", requestId);

  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (CSRF_METHODS.has(method)) {
    const csrfToken = decodeURIComponent(getCookie("csrftoken"));
    if (csrfToken && !headers.has("X-CSRFToken")) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  try {
    const response = await fetch(path, {
      ...options,
      cache: "no-store",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      reportApiFailure({ path, method, requestId, status: response.status, errorCode: "http_error" });
    }

    return response;
  } catch (error) {
    reportApiFailure({ path, method, requestId, errorCode: "network_error" });
    throw error;
  }
}

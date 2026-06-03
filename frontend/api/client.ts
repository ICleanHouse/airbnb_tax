import * as Sentry from "@sentry/nextjs";

import type { UserRole } from "../types/user";

const ROLE_LABELS: Record<UserRole, string> = {
  host: "Property owner",
  cleaner: "Cleaner",
  agency: "Agency",
  admin: "Admin",
};

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `req_${crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function currentRoute(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

function reportApiFailure({
  path,
  method,
  requestId,
  status,
  error,
}: {
  path: string;
  method: string;
  requestId: string;
  status?: number;
  error?: unknown;
}): void {
  const context = {
    path,
    method,
    request_id: requestId,
    route: currentRoute(),
    status_code: status,
  };

  if (error) {
    Sentry.captureException(error, {
      tags: { event: "frontend.api_network_error" },
      extra: context,
    });
    return;
  }

  Sentry.captureMessage("API request failed", {
    level: status && status >= 500 ? "error" : "warning",
    tags: { event: "frontend.api_response_failed" },
    extra: context,
  });
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = options.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();

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
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      reportApiFailure({ path, method, requestId, status: response.status });
    }

    return response;
  } catch (error) {
    reportApiFailure({ path, method, requestId, error });
    throw error;
  }
}

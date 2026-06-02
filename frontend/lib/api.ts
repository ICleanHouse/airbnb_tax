import * as Sentry from "@sentry/nextjs";

export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";
export type UserRole = "host" | "cleaner" | "agency" | "admin";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  preferred_language: "bg" | "en";
  role: UserRole;
  account_status: AccountStatus;
  is_approved: boolean;
  is_platform_admin: boolean;
}

export interface PublicCleaner {
  id: number;
  user_id: number;
  kind: string;
  display_name: string;
  bio: string;
  service_areas: string[];
  native_language: string;
  other_languages: string[];
  personal_preferences: string[];
  experience_level: string;
  work_preference: string;
  job_type_preference: string;
  preferred_time_slots: string[];
  weekly_availability: Record<string, string[]>;
  has_driving_license: boolean | null;
  has_own_car: boolean | null;
  profile_image: string;
  average_rating: string;
  completed_jobs_count: number;
  is_verified: boolean;
}

export interface CleanerReview {
  id: number;
  rating: number;
  comment: string;
  reviewer_name: string;
  created_at: string;
}

export interface PublicCleanerDetail extends PublicCleaner {
  reviews: CleanerReview[];
}

export interface FavouriteCleaner {
  id: number;
  cleaner: number;
  cleaner_name: string;
  cleaner_profile_id: number | null;
  average_rating: number | null;
  completed_jobs_count: number;
  profile_image: string | null;
  service_areas: string[];
  created_at: string;
}

export interface AppNotification {
  id: number;
  notification_type: string;
  channel: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

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

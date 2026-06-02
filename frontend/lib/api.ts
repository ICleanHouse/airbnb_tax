/**
 * API client for the Host Cleaner Marketplace backend.
 *
 * All paths must start with /api/ so Next.js rewrites them to the Django
 * backend (configured in next.config.mjs → rewrites → /api/:path*).
 */

/** Matches the Role choices on the Django User model. */
export type UserRole = "host" | "cleaner" | "agency" | "admin";

/** Matches the AccountStatus choices on the Django User model. */
export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

/** Shape returned by /api/accounts/me/ */
export interface CurrentUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  account_status: AccountStatus;
  is_approved: boolean;
  is_platform_admin: boolean;
}

/** A public, PII-safe cleaner card from /api/accounts/public-cleaners/. */
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

/** A received review embedded in a cleaner's public detail payload. */
export interface CleanerReview {
  id: number;
  rating: number;
  comment: string;
  reviewer_name: string;
  created_at: string;
}

/** Public cleaner detail = card fields + the cleaner's received reviews. */
export interface PublicCleanerDetail extends PublicCleaner {
  reviews: CleanerReview[];
}

/** A saved/favourite cleaner from /api/marketplace/favourites/. */
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

/** An in-app notification from /api/notifications/notifications/. */
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

/** Human-readable label for a user role. */
export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Read the Django CSRF token from the csrftoken cookie.
 * Django sets this cookie on any response from a view decorated with
 * ensure_csrf_cookie. DRF's SessionAuthentication requires it as the
 * X-CSRFToken header on all state-changing requests when a session exists.
 */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Thin fetch wrapper that:
 * - Adds Content-Type: application/json when a body is present.
 * - Adds X-CSRFToken on state-changing requests so DRF SessionAuthentication
 *   does not reject them with 403 after a session has been established.
 * - Returns the raw Response so callers can check .ok and call .json() themselves.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  // Only inject JSON content-type for string bodies (JSON.stringify output).
  // FormData bodies must not have Content-Type set — the browser adds the
  // multipart boundary automatically.
  if (typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (CSRF_METHODS.has(method) && !headers["X-CSRFToken"]) {
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;
  }

  return fetch(path, { ...options, headers });
}

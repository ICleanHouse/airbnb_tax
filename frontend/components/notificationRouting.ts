import type { AppNotification } from "../types/notification";
import { localeFromPathname, safeInternalDestination, withLocale } from "../lib/redirects";

const ALLOWED_PATHS = new Set(["/admin", "/app", "/host", "/cleaner", "/agency"]);
const ALLOWED_QUERY_KEYS = new Set([
  "section",
  "appFilter",
  "reviewJob",
  "reviewId",
  "connectionId",
]);
const NUMERIC_QUERY_KEYS = new Set(["reviewJob", "reviewId", "connectionId"]);

function safeCanonicalDestination(value: unknown): string | null {
  const destination = safeInternalDestination(value);
  if (!destination) return null;
  const parsed = new URL(destination, "https://host-cleaners.invalid");
  if (!ALLOWED_PATHS.has(parsed.pathname.replace(/^\/(bg|en)(?=\/|$)/, "") || "/")) return null;
  for (const [key, item] of parsed.searchParams) {
    if (!ALLOWED_QUERY_KEYS.has(key) || item.length === 0 || item.length > 64 || (NUMERIC_QUERY_KEYS.has(key) && !/^\d+$/.test(item))) return null;
  }
  return destination;
}

function numericMetadata(notification: AppNotification, key: string): number | null {
  const value = notification.metadata?.[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function roleFallback(pathname: string): string {
  const normalized = new URL(pathname, "https://host-cleaners.invalid").pathname.replace(/^\/(bg|en)(?=\/|$)/, "") || "/";
  if (normalized.startsWith("/host")) return "/host";
  if (normalized.startsWith("/cleaner")) return "/cleaner";
  if (normalized.startsWith("/agency")) return "/agency";
  if (normalized.startsWith("/admin")) return "/admin";
  return "/app";
}

export function notificationDestination(
  notification: AppNotification,
  pathname: string,
): string {
  const canonical = safeCanonicalDestination(notification.metadata?.destination);
  const locale = localeFromPathname(pathname);
  if (canonical) return withLocale(canonical, locale);

  // Compatibility for notifications persisted before the v1 event contract.
  const jobId = numericMetadata(notification, "job_id");
  const reviewId = numericMetadata(notification, "review_id");
  if (notification.notification_type === "review.requested" && jobId) {
    return withLocale(pathname.replace(/^\/(bg|en)(?=\/|$)/, "").startsWith("/host")
      ? `/host?section=applications&appFilter=completed&reviewJob=${jobId}`
      : `/cleaner?section=assignments&reviewJob=${jobId}`, locale);
  }
  if (
    (notification.notification_type === "review.revealed" ||
      notification.notification_type === "review.submitted") &&
    jobId
  ) {
    const onHost = pathname.replace(/^\/(bg|en)(?=\/|$)/, "").startsWith("/host");
    const params = new URLSearchParams({
      section: onHost ? "applications" : "assignments",
      reviewJob: String(jobId),
    });
    if (onHost) params.set("appFilter", "rating");
    if (reviewId) params.set("reviewId", String(reviewId));
    return withLocale(`${onHost ? "/host" : "/cleaner"}?${params.toString()}`, locale);
  }
  if (pathname.replace(/^\/(bg|en)(?=\/|$)/, "").startsWith("/host")) {
    if (["application.submitted", "application.withdrawn"].includes(notification.notification_type)) {
      return withLocale("/host?section=applications&appFilter=pending", locale);
    }
    if (notification.notification_type === "offer.accepted") {
      return withLocale("/host?section=applications&appFilter=active", locale);
    }
    if (notification.notification_type === "offer.declined") {
      return withLocale("/host?section=applications", locale);
    }
  }
  return withLocale(roleFallback(pathname), locale);
}

export function connectionTarget(
  notification: AppNotification,
): { connectionId: number; openChat: boolean } | null {
  const supported = new Set([
    "message.received",
    "connection.accepted",
    "connection.requested",
    "connection.request",
  ]);
  if (!supported.has(notification.notification_type)) return null;
  const canonical = safeCanonicalDestination(notification.metadata?.destination);
  let connectionId: number | null = null;
  if (canonical) {
    connectionId = Number(new URL(canonical, "https://host-cleaners.invalid").searchParams.get("connectionId"));
    if (!Number.isSafeInteger(connectionId) || connectionId <= 0) connectionId = null;
  }
  connectionId ??= numericMetadata(notification, "connection_id");
  if (!connectionId) return null;
  return {
    connectionId,
    openChat: ["message.received", "connection.accepted"].includes(notification.notification_type),
  };
}

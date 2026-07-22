import type { AppNotification } from "../types/notification";

const ALLOWED_PATHS = new Set(["/admin", "/app", "/host", "/cleaner"]);
const ALLOWED_QUERY_KEYS = new Set([
  "section",
  "appFilter",
  "reviewJob",
  "reviewId",
  "connectionId",
]);
const NUMERIC_QUERY_KEYS = new Set(["reviewJob", "reviewId", "connectionId"]);

function safeCanonicalDestination(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://host-cleaners.invalid");
    if (
      parsed.origin !== "https://host-cleaners.invalid" ||
      parsed.hash ||
      !ALLOWED_PATHS.has(parsed.pathname)
    ) {
      return null;
    }
    for (const [key, item] of parsed.searchParams) {
      if (
        !ALLOWED_QUERY_KEYS.has(key) ||
        item.length === 0 ||
        item.length > 64 ||
        (NUMERIC_QUERY_KEYS.has(key) && !/^\d+$/.test(item))
      ) {
        return null;
      }
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function numericMetadata(notification: AppNotification, key: string): number | null {
  const value = notification.metadata?.[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function roleFallback(pathname: string): string {
  if (pathname.startsWith("/host")) return "/host";
  if (pathname.startsWith("/cleaner")) return "/cleaner";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/app";
}

export function notificationDestination(
  notification: AppNotification,
  pathname: string,
): string {
  const canonical = safeCanonicalDestination(notification.metadata?.destination);
  if (canonical) return canonical;

  // Compatibility for notifications persisted before the v1 event contract.
  const jobId = numericMetadata(notification, "job_id");
  const reviewId = numericMetadata(notification, "review_id");
  if (notification.notification_type === "review.requested" && jobId) {
    return pathname.startsWith("/host")
      ? `/host?section=applications&appFilter=completed&reviewJob=${jobId}`
      : `/cleaner?section=assignments&reviewJob=${jobId}`;
  }
  if (
    (notification.notification_type === "review.revealed" ||
      notification.notification_type === "review.submitted") &&
    jobId
  ) {
    const params = new URLSearchParams({
      section: pathname.startsWith("/host") ? "applications" : "assignments",
      reviewJob: String(jobId),
    });
    if (pathname.startsWith("/host")) params.set("appFilter", "rating");
    if (reviewId) params.set("reviewId", String(reviewId));
    return `${pathname.startsWith("/host") ? "/host" : "/cleaner"}?${params.toString()}`;
  }
  if (pathname.startsWith("/host")) {
    if (["application.submitted", "application.withdrawn"].includes(notification.notification_type)) {
      return "/host?section=applications&appFilter=pending";
    }
    if (notification.notification_type === "offer.accepted") {
      return "/host?section=applications&appFilter=active";
    }
    if (notification.notification_type === "offer.declined") {
      return "/host?section=applications";
    }
  }
  return roleFallback(pathname);
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

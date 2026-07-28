import type { CurrentUser } from "../types/user";

const APP_ORIGIN = "https://host-cleaners.invalid";
const LOCALES = new Set(["bg", "en"]);
const APP_PATHS = new Set(["/", "/app", "/admin", "/host", "/cleaner", "/agency", "/cleaners"]);
const QUERY_RULES: Record<string, "text" | "numeric" | "publicId" | "role"> = {
  as: "text",
  // Public cleaner routes use opaque UUIDs. Private operational endpoints keep
  // their numeric identifiers outside this post-auth return allowlist.
  cleaner: "publicId",
  role: "role",
  section: "text",
  appFilter: "text",
  reviewJob: "numeric",
  reviewId: "numeric",
  connectionId: "numeric",
};
const VALID_ROLES = new Set(["host", "cleaner", "agency"]);

export type AppLocale = "bg" | "en";

function splitLocale(pathname: string): { locale: AppLocale | null; path: string } {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  if (first && LOCALES.has(first)) {
    return { locale: first as AppLocale, path: `/${parts.slice(1).join("/")}` || "/" };
  }
  return { locale: null, path: pathname || "/" };
}

export function localeFromPathname(pathname: string, fallback: AppLocale = "bg"): AppLocale {
  return splitLocale(pathname).locale ?? fallback;
}

export function withLocale(path: string, locale: AppLocale): string {
  const safe = safeInternalDestination(path);
  if (!safe) return `/${locale}/`;
  const parsed = new URL(safe, APP_ORIGIN);
  const { path: canonicalPath } = splitLocale(parsed.pathname);
  return `/${locale}${canonicalPath === "/" ? "/" : canonicalPath}${parsed.search}`;
}

/**
 * Accepts only small, application-owned relative paths and an explicit query
 * allowlist. The result is still a relative path, never an external URL.
 */
export function safeInternalDestination(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://")) {
    return null;
  }

  try {
    const parsed = new URL(value, APP_ORIGIN);
    if (parsed.origin !== APP_ORIGIN || parsed.hash) return null;
    const { path } = splitLocale(parsed.pathname);
    if (!APP_PATHS.has(path)) return null;
    for (const [key, item] of parsed.searchParams) {
      const rule = QUERY_RULES[key];
      if (!rule || item.length === 0 || item.length > 64) return null;
      if (rule === "numeric" && (!/^\d+$/.test(item) || !Number.isSafeInteger(Number(item)) || Number(item) < 1)) return null;
      if (rule === "publicId" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)) return null;
      if (rule === "role" && !VALID_ROLES.has(item)) return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function defaultWorkspace(user: CurrentUser): string {
  if (user.is_platform_admin) return "/admin";
  if (user.role === "host") return "/host";
  if (user.role === "cleaner") return "/cleaner";
  if (user.role === "agency") return "/agency";
  return "/app";
}

function isAllowedForUser(path: string, user: CurrentUser): boolean {
  const { path: canonicalPath } = splitLocale(new URL(path, APP_ORIGIN).pathname);
  if (canonicalPath === "/" || canonicalPath === "/app") return true;
  if (user.is_platform_admin) return canonicalPath === "/admin" || canonicalPath === "/cleaners";
  if (user.role === "host") return canonicalPath === "/host" || canonicalPath === "/cleaners";
  return canonicalPath === defaultWorkspace(user);
}

/** Routes terminal/unknown account states to the locked generic workspace. */
export function postAuthDestination(
  user: CurrentUser | null,
  requestedDestination: unknown,
  locale: AppLocale,
): string {
  if (!user) return withLocale("/", locale);
  if (!user.is_platform_admin && user.account_status !== "approved" && user.account_status !== "pending") {
    return withLocale("/app", locale);
  }

  const requested = safeInternalDestination(requestedDestination);
  if (requested && isAllowedForUser(requested, user)) {
    return withLocale(requested, localeFromPathname(requested, locale));
  }
  return withLocale(defaultWorkspace(user), locale);
}

import { cities as locationCityCatalog } from "../../lib/cityDistricts";
import { SOFIA_DISTRICTS } from "../../lib/sofiaDistricts";

export const SIGNUP_RECOVERY_KEY = "signup_wizard_state";
export const SIGNUP_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

const SIGNUP_RECOVERY_VERSION = 1 as const;
const SIGNUP_ROLES = new Set(["host", "cleaner", "agency"]);
const RECOGNIZED_CITY_SLUGS = new Set(locationCityCatalog.map((city) => city.value));
const SOFIA_ZONE_IDS = new Set(SOFIA_DISTRICTS.map((district) => district.id));
const SOFIA_ZONE_ID_BY_EXACT_NAME = new Map(
  SOFIA_DISTRICTS.map((district) => [district.name, district.id] as const),
);
const EXPERIENCE_LEVELS = new Set([
  "none",
  "1_year",
  "2_years",
  "3_years",
  "4_years",
  "5_years",
  "more_than_5_years",
]);
const LEGACY_SIGNUP_KEYS = [
  "signup_draft",
  "signup_email_verification_token",
  "signup_role",
  "signup_city",
  "signup_city_label",
  "signup_zones",
  "signup_birth_date",
  "signup_sex",
  "signup_native_language",
  "signup_experience_level",
  "signup_introduction",
  "signup_password",
  "signup_password_confirm",
  "signup_confirmation_code",
] as const;

export type SignupRecoveryRole = "host" | "cleaner" | "agency";

export type SignupRecoveryInput = {
  role: SignupRecoveryRole | null;
  citySlug: string;
  selectedZoneIds: string[];
  experienceLevel: string;
};

export type SignupRecoveryState = SignupRecoveryInput & {
  version: typeof SIGNUP_RECOVERY_VERSION;
  savedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeRole(value: unknown): SignupRecoveryRole | null {
  return typeof value === "string" && SIGNUP_ROLES.has(value)
    ? value as SignupRecoveryRole
    : null;
}

function safeCitySlug(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return RECOGNIZED_CITY_SLUGS.has(normalized) ? normalized : "";
}

function safeZoneIds(value: unknown, citySlug: string): string[] {
  if (citySlug !== "sofia" || !Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => (
    typeof item === "string"
      && SOFIA_ZONE_IDS.has(item as `sofia:osm-${string}`)
  ))));
}

function migrateLegacyZoneIds(value: unknown, citySlug: string): string[] {
  if (citySlug !== "sofia" || !Array.isArray(value)) return [];
  const migrated = value.flatMap((item) => {
    if (typeof item !== "string") return [];
    if (SOFIA_ZONE_IDS.has(item as `sofia:osm-${string}`)) return [item];
    const canonicalId = SOFIA_ZONE_ID_BY_EXACT_NAME.get(item);
    return canonicalId ? [canonicalId] : [];
  });
  return Array.from(new Set(migrated));
}

function safeExperienceLevel(value: unknown): string {
  return typeof value === "string" && EXPERIENCE_LEVELS.has(value) ? value : "";
}

function hasRecoverableProgress(state: SignupRecoveryInput): boolean {
  return Boolean(
    state.role
      || state.citySlug
      || state.selectedZoneIds.length > 0
      || state.experienceLevel,
  );
}

function stateFromInput(input: SignupRecoveryInput, savedAt: number): SignupRecoveryState {
  const citySlug = safeCitySlug(input.citySlug);
  return {
    version: SIGNUP_RECOVERY_VERSION,
    savedAt,
    role: safeRole(input.role),
    citySlug,
    selectedZoneIds: safeZoneIds(input.selectedZoneIds, citySlug),
    experienceLevel: safeExperienceLevel(input.experienceLevel),
  };
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSignupRecovery(storage: StorageLike): void {
  storage.removeItem(SIGNUP_RECOVERY_KEY);
  for (const key of LEGACY_SIGNUP_KEYS) storage.removeItem(key);
}

export function saveSignupRecovery(
  storage: StorageLike,
  input: SignupRecoveryInput,
  now: number = Date.now(),
): void {
  const state = stateFromInput(input, now);
  if (!hasRecoverableProgress(state)) {
    storage.removeItem(SIGNUP_RECOVERY_KEY);
    return;
  }
  storage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify(state));
}

export function restoreSignupRecovery(
  storage: StorageLike,
  now: number = Date.now(),
): SignupRecoveryState | null {
  const currentRaw = storage.getItem(SIGNUP_RECOVERY_KEY);
  const legacyRole = storage.getItem("signup_role");
  const legacyCity = storage.getItem("signup_city");
  const legacyZones = storage.getItem("signup_zones");
  const legacyExperience = storage.getItem("signup_experience_level");

  // Remove every known legacy record before parsing any of its untrusted data.
  clearSignupRecovery(storage);

  const current = parseJsonRecord(currentRaw);
  if (current?.version === SIGNUP_RECOVERY_VERSION) {
    const savedAt = typeof current.savedAt === "number" ? current.savedAt : Number.NaN;
    if (!Number.isFinite(savedAt) || savedAt > now || now - savedAt > SIGNUP_RECOVERY_TTL_MS) {
      return null;
    }
    const state = stateFromInput(
      {
        role: safeRole(current.role),
        citySlug: safeCitySlug(current.citySlug),
        selectedZoneIds: Array.isArray(current.selectedZoneIds)
          ? current.selectedZoneIds.filter((item): item is string => typeof item === "string")
          : [],
        experienceLevel: safeExperienceLevel(current.experienceLevel),
      },
      savedAt,
    );
    if (!hasRecoverableProgress(state)) return null;
    storage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify(state));
    return state;
  }

  let parsedLegacyZones: unknown = [];
  if (legacyZones) {
    try {
      parsedLegacyZones = JSON.parse(legacyZones) as unknown;
    } catch {
      parsedLegacyZones = [];
    }
  }

  const legacyCitySlug = safeCitySlug(current?.city ?? legacyCity);
  const legacyState = stateFromInput(
    {
      role: safeRole(current?.role) ?? safeRole(legacyRole),
      citySlug: legacyCitySlug,
      selectedZoneIds: migrateLegacyZoneIds(
        current?.selectedZones ?? parsedLegacyZones,
        legacyCitySlug,
      ),
      experienceLevel: safeExperienceLevel(current?.experience ?? legacyExperience),
    },
    now,
  );
  if (!hasRecoverableProgress(legacyState)) return null;
  storage.setItem(SIGNUP_RECOVERY_KEY, JSON.stringify(legacyState));
  return legacyState;
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gift,
  Home as HomeIcon,
  LayoutGrid,
  LogOut,
  Plus,
  RefreshCcw,
  Send,
  Star,
  User,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname as useLocalePathname, useRouter as useLocaleRouter } from "../../i18n/navigation";
import { apiFetch, CurrentUser } from "../../lib/api";
import VerificationStatusSummary from "../../components/VerificationStatusSummary";
import { money, formatMoney } from "../../lib/money";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { useRefocusClickGuard } from "../../lib/useRefocusClickGuard";
import DistrictMapSelector from "../../components/DistrictMapSelector";
import NotificationBell from "../../components/NotificationBell";
import Connections from "../../components/Connections";
import AppdashGrid from "../../components/AppdashGrid";
import { useAppdashPrefs } from "../../lib/useAppdashPrefs";
import RatingStars from "../../components/RatingStars";
import ReviewModal from "../../components/ReviewModal";
import AccountDeletionPanel from "../../components/AccountDeletionPanel";
import CancelJobDialog from "../../components/CancelJobDialog";
import { cities } from "../../lib/cityDistricts";
import { fallbackServiceZones, serviceAreaNamesToZoneIds, zoneIdsToServiceAreaNames } from "../../lib/locations";
import type { ServiceZone } from "../../types/locations";
import { CLEANER_IMAGE_MAX_BYTES, validateImageFile } from "../../lib/uploadValidation";

type JobStatus = "draft" | "open" | "assigned" | "completed" | "cancelled";
type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";
type CleanerSex = "male" | "female" | "prefer_not_to_say";

interface CleanerProfile {
  id: number;
  verification_status: VerificationStatus;
  bio: string;
  city: string;
  service_areas: string[];
  sex: CleanerSex;
  native_language: string;
  other_languages: string[];
  personal_preferences: string[];
  education: string;
  birth_date: string | null;
  age: number | null;
  experience_level: string;
  has_driving_license: boolean | null;
  has_own_car: boolean | null;
  profile_image: string;
  average_rating: string;
  completed_jobs_count: number;
  is_verified: boolean;
}

interface AssignmentSummary {
  id: number;
  job: number;
  cleaner: number;
  assigned_member: number | null;
  application: number | null;
  agreed_price: string | null;
  assigned_at: string;
  cancelled_at: string | null;
  host_completed_at: string | null;
  cleaner_completed_at: string | null;
  completed_at: string | null;
  available_actions?: string[];
}

interface CleaningJob {
  id: number;
  access_tier?: "evaluator" | "assigned" | "history" | "owner" | "admin";
  city_slug?: string;
  city_name_bg?: string;
  city_name_en?: string;
  zone_id?: string | null;
  zone_name_bg?: string;
  zone_name_en?: string;
  bedrooms?: number | null;
  square_metres?: string | null;
  can_apply?: boolean;
  property_name?: string;
  property_address?: string;
  property_image?: string | null;
  host?: number;
  host_name?: string;
  scheduled_start: string;
  scheduled_end: string;
  currency: string;
  proposed_price: string | null;
  agreed_price?: string | null;
  status: JobStatus;
  cleaning_instructions?: string;
  assignment?: AssignmentSummary | null;
  available_actions?: string[];
}

type ApplicationOrigin = "cleaner_applied" | "host_offered";

interface CleanerApplication {
  id: number;
  job: number;
  job_summary?: CleaningJob;
  status: ApplicationStatus;
  origin: ApplicationOrigin;
  proposed_price: string | null;
  created_at: string;
}

type CalendarItemType = "open_job" | "application" | "assignment" | "offer";
interface CalendarItem {
  id: string;
  item_type: CalendarItemType;
  job: number;
  application?: number | null;
  assignment?: number | null;
  access_tier: "evaluator" | "assigned" | "history" | "owner" | "admin";
  scheduled_start: string;
  scheduled_end: string;
  currency: string;
  proposed_price: string | null;
  city_slug?: string;
  city_name_bg?: string;
  city_name_en?: string;
  zone_id?: string | null;
  zone_name_bg?: string;
  zone_name_en?: string;
  bedrooms?: number | null;
  square_metres?: string | null;
  property_name?: string;
  property_address?: string;
  property_image?: string | null;
  host?: number;
  host_name?: string;
  agreed_price?: string | null;
  cleaning_instructions?: string;
  status: JobStatus;
  application_status?: ApplicationStatus | "";
  application_origin?: ApplicationOrigin | "";
  host_completed_at: string | null;
  cleaner_completed_at: string | null;
  completed_at: string | null;
  can_apply: boolean;
  can_complete: boolean;
}

interface Review {
  id: number;
  job: number;
  reviewer: number;
  reviewer_name: string;
  reviewee: number;
  rating: number;
  comment: string;
  created_at: string;
}

type CropSource = {
  src: string;
  width: number;
  height: number;
};

type ProfileFormSnapshot = {
  firstName: string;
  lastName: string;
  city: string;
  sex: CleanerSex;
  birthDate: string;
  nativeLanguage: string;
  otherLanguages: string;
  personalPreferences: string;
  education: string;
  hasDrivingLicense: "" | "yes" | "no";
  hasOwnCar: "" | "yes" | "no";
  experienceLevel: string;
  serviceAreas: string;
  profileImage: string;
  bio: string;
};

type ProfileFieldErrorKey =
  | "first_name"
  | "last_name"
  | "sex"
  | "birth_date"
  | "district_city"
  | "service_areas"
  | "native_language"
  | "other_languages"
  | "personal_preferences"
  | "education"
  | "experience_level"
  | "has_driving_license"
  | "has_own_car"
  | "profile_image"
  | "bio";

type ProfileFieldErrors = Partial<Record<ProfileFieldErrorKey, string>>;

type Section = "calendar" | "applications" | "offers" | "profile";
type CleanerAppFilter = "pending" | "active" | "completed" | "open" | "rating" | null;

const sexOptionValues: CleanerSex[] = ["male", "female", "prefer_not_to_say"];
const nativeLanguageOptions = [
  { value: "Български", label: "Български" },
  { value: "Русский", label: "Русский" },
  { value: "English", label: "English" },
  { value: "Română", label: "Română" },
  { value: "Српски", label: "Српски" },
  { value: "Ελληνικά", label: "Ελληνικά" },
  { value: "Українська", label: "Українська" },
  { value: "Македонски", label: "Македонски" },
  { value: "Bosanski", label: "Bosanski" },
  { value: "Hrvatski", label: "Hrvatski" },
  { value: "Slovenščina", label: "Slovenščina" },
  { value: "Shqip", label: "Shqip" },
  { value: "Español", label: "Español" },
  { value: "Français", label: "Français" },
  { value: "Deutsch", label: "Deutsch" },
  { value: "Italiano", label: "Italiano" },
  { value: "Português", label: "Português" },
  { value: "Nederlands", label: "Nederlands" },
  { value: "Polski", label: "Polski" },
  { value: "Čeština", label: "Čeština" },
  { value: "Slovenčina", label: "Slovenčina" },
];
const additionalLanguageOptions = [
  "Türkçe",
  "العربية",
  "עברית",
  "Magyar",
  "Русиньскый",
];
const educationOptionValues = ["none", "primary", "high_school", "higher"] as const;
type EducationValue = typeof educationOptionValues[number];
const experienceOptionValues = ["none", "1_year", "2_years", "3_years", "4_years", "5_years", "more_than_5_years"] as const;
type ExperienceValue = typeof experienceOptionValues[number];
const otherLanguageCatalog = Array.from(
  new Set([...nativeLanguageOptions.map((option) => option.value), ...additionalLanguageOptions]),
).sort((a, b) => a.localeCompare(b, "bg"));
const personalPreferenceValues = ["provide_cleaning_supplies", "wash_and_dry_linen_towels", "iron_and_fold_linen_towels", "pet_friendly_homes"] as const;
type PersonalPreferenceValue = typeof personalPreferenceValues[number];
const DEFAULT_PROFILE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f3f4f6"/><stop offset="100%" stop-color="#e5e7eb"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="120" cy="88" r="40" fill="#cbd5e1"/><path d="M40 214c8-40 38-62 80-62s72 22 80 62H40z" fill="#cbd5e1"/></svg>',
)}`;
const PROFILE_CROP_PREVIEW_SIZE = 360;
const PROFILE_CROP_EXPORT_SIZE = 720;
const PROFILE_CROP_MIN_ZOOM = 1;
const PROFILE_CROP_MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function profileCropBaseScale(source: CropSource, canvasSize: number) {
  return Math.max(canvasSize / source.width, canvasSize / source.height);
}

function clampProfileCropOffset(offset: { x: number; y: number }, source: CropSource, zoom: number, canvasSize: number) {
  const drawScale = profileCropBaseScale(source, canvasSize) * zoom;
  const drawWidth = source.width * drawScale;
  const drawHeight = source.height * drawScale;
  const maxX = Math.max(0, (drawWidth - canvasSize) / 2);
  const maxY = Math.max(0, (drawHeight - canvasSize) / 2);
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

function firstWeekday(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function adultCutoffDate() {
  const today = new Date();
  return new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
}

function isAdultBirthDate(value: string) {
  if (!value) return false;
  if (!isValidDateValue(value)) return false;
  return value <= dateValue(adultCutoffDate());
}

function isValidDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}


function calendarItemColor(item: CalendarItem) {
  if (item.item_type === "offer") {
    return "var(--gold)";
  }
  if (item.item_type === "assignment") {
    return item.completed_at || item.status === "completed" ? "#22c55e" : "var(--gold)";
  }
  if (item.item_type === "application") {
    if (item.application_status === "accepted") return "var(--teal)";
    if (item.application_status === "rejected" || item.application_status === "withdrawn") return "var(--warning)";
    return "var(--gold)";
  }
  return "var(--teal)";
}

function serviceAreasFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeServiceAreasText(value: string) {
  return serviceAreasFromText(value).join("\n");
}

const ALL_DISTRICTS = new Set(cities.flatMap((city) => city.zones));

function inferCityFromServiceAreas(value: string) {
  const areas = serviceAreasFromText(value);
  for (const city of cities) {
    if (city.zones.some((zone) => areas.includes(zone))) {
      return city.value;
    }
  }
  return "";
}

function normalizeServiceAreasByCity(value: string, cityValue: string) {
  const areas = serviceAreasFromText(value);
  if (!cityValue) return [];
  const selectedCity = cities.find((city) => city.value === cityValue);
  if (!selectedCity) return [];
  const cityZones = new Set(selectedCity.zones);
  return areas.filter((item) => cityZones.has(item));
}

function buildProfileSnapshot(snapshot: ProfileFormSnapshot) {
  return JSON.stringify(snapshot);
}

function boolToChoice(value: boolean | null | undefined): "" | "yes" | "no" {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function choiceToBool(value: "" | "yes" | "no"): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function sanitizePersonalPreferences(value: string[]) {
  const allowed = new Set<string>(personalPreferenceValues);
  return Array.from(new Set(value.filter((item) => allowed.has(item))));
}

function labelFromOptions(options: Array<{ value: string; label: string }>, value?: string | null) {
  return options.find((option) => option.value === value)?.label || "Not set";
}

function readList<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  return ((data as { results?: T[] }).results ?? []) as T[];
}

function messageFromResponse(data: unknown, fallback: string) {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data === "object") {
    const parts: string[] = [];
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") parts.push(item);
        }
      } else if (typeof value === "string") {
        parts.push(value);
      }
    }
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }
  return fallback;
}

function firstValidationMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstValidationMessage(item);
      if (message) return message;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const message = firstValidationMessage(nested);
      if (message) return message;
    }
  }
  return null;
}

function extractFieldErrors(
  data: unknown,
  fieldMap: Partial<Record<string, ProfileFieldErrorKey>>,
  fallback: string,
): { fieldErrors: ProfileFieldErrors; formError: string } {
  const fieldErrors: ProfileFieldErrors = {};
  if (typeof data === "string") {
    return { fieldErrors, formError: data };
  }
  if (data && typeof data === "object") {
    let formError = "";
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const message = firstValidationMessage(value);
      if (!message) continue;
      const mappedField = fieldMap[key];
      if (mappedField) {
        fieldErrors[mappedField] = message;
      } else if (!formError && (key === "detail" || key === "non_field_errors")) {
        formError = message;
      }
    }
    if (Object.keys(fieldErrors).length > 0 || formError) {
      return { fieldErrors, formError: formError || fallback };
    }
  }
  return { fieldErrors, formError: fallback };
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "Date not set";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isPastDateTime(iso?: string | null, now = new Date()) {
  if (!iso) return false;
  return new Date(iso).getTime() <= now.getTime();
}

function jobPlace(job?: Pick<CleaningJob, "property_name" | "zone_name_bg" | "zone_name_en" | "city_name_bg" | "city_name_en"> | null) {
  if (!job) return "Job details";
  if (job.property_name) {
    const city = job.city_name_bg || job.city_name_en || "";
    return city ? `${job.property_name} - ${city}` : job.property_name;
  }
  const zone = job.zone_name_bg || job.zone_name_en || "";
  const city = job.city_name_bg || job.city_name_en || "";
  return [zone, city].filter(Boolean).join(" · ") || "Job details";
}

function calendarPlace(item: CalendarItem) {
  if (item.property_name) {
    const city = item.city_name_bg || item.city_name_en || "";
    return city ? `${item.property_name} - ${city}` : item.property_name;
  }
  const zone = item.zone_name_bg || item.zone_name_en || "";
  const city = item.city_name_bg || item.city_name_en || "";
  return [zone, city].filter(Boolean).join(" · ");
}

export default function CleanerDashboard() {
  const t = useTranslations("cleaner");
  const tC = useTranslations("common");
  const tNav = useTranslations("nav");
  const localeRouter = useLocaleRouter();
  const localePathname = useLocalePathname();
  const MONTHS = tC.raw("monthsFull") as string[];
  const DAYS = tC.raw("calDays") as string[];
  const STATUS_LABEL: Record<JobStatus, string> = {
    draft:     t("calendar.statusLabel.draft"),
    open:      t("calendar.statusLabel.open"),
    assigned:  t("calendar.statusLabel.assigned"),
    completed: t("calendar.statusLabel.completed"),
    cancelled: t("calendar.statusLabel.cancelled"),
  };
  const APPLICATION_LABEL: Record<ApplicationStatus, string> = {
    pending:   t("calendar.applicationLabel.pending"),
    accepted:  t("calendar.applicationLabel.accepted"),
    rejected:  t("calendar.applicationLabel.rejected"),
    withdrawn: t("calendar.applicationLabel.withdrawn"),
  };
  const CALENDAR_LABEL: Record<CalendarItemType, string> = {
    open_job:    t("calendar.calendarLabel.open_job"),
    application: t("calendar.calendarLabel.application"),
    assignment:  t("calendar.calendarLabel.assignment"),
    offer:       t("calendar.calendarLabel.offer"),
  };
  const BIRTHDATE_MONTH_NAMES = tC.raw("months") as string[];
  const BIRTHDATE_WEEKDAY_LABELS = tC.raw("weekdays") as string[];
  const sexOptions: Array<{ value: CleanerSex; label: string }> = sexOptionValues.map((v) => ({
    value: v,
    label: t(`profile.sexOptions.${v}`),
  }));
  const tPF = useTranslations("cleaner.profileForm");
  const educationOptions: Array<{ value: EducationValue; label: string }> = educationOptionValues.map((v) => ({
    value: v,
    label: tPF(`educationOptions.${v}` as Parameters<typeof tPF>[0]),
  }));
  const experienceOptions: Array<{ value: string; label: string }> = experienceOptionValues.map((v) => ({
    value: v,
    label: tPF(`experienceOptions.${v}` as Parameters<typeof tPF>[0]),
  }));
  const personalPreferenceOptions: Array<{ value: PersonalPreferenceValue; label: string }> = personalPreferenceValues.map((v) => ({
    value: v,
    label: tPF(`personalPreferenceOptions.${v}` as Parameters<typeof tPF>[0]),
  }));
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shouldSuppressModalOpen = useRefocusClickGuard();
  const cutoffDate = useMemo(() => adultCutoffDate(), []);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth();
  const yearOptions = useMemo(() => Array.from({ length: 83 }, (_, index) => cutoffDate.getFullYear() - index), [cutoffDate]);
  const minBirthDate = `${yearOptions[yearOptions.length - 1]}-01-01`;
  const maxBirthDate = dateValue(cutoffDate);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [profile, setProfile] = useState<CleanerProfile | null>(null);
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
  const [applications, setApplications] = useState<CleanerApplication[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [dataError, setDataError] = useState("");
  const [section, setSection] = useState<Section>("calendar");
  const [appFilter, setAppFilter] = useState<CleanerAppFilter>(null);
  const appdash = useAppdashPrefs(me);
  const [jobCityFilter, setJobCityFilter] = useState<string>("");
  const [selectedPropertyKey, setSelectedPropertyKey] = useState<string | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileSex, setProfileSex] = useState<CleanerSex>("prefer_not_to_say");
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [profileBirthCalendarOpen, setProfileBirthCalendarOpen] = useState(false);
  const [profileBirthCalendarYear, setProfileBirthCalendarYear] = useState(cutoffYear);
  const [profileBirthCalendarMonth, setProfileBirthCalendarMonth] = useState(0);
  const [profileNativeLanguage, setProfileNativeLanguage] = useState("");
  const [profileOtherLanguages, setProfileOtherLanguages] = useState<string[]>([]);
  const [profilePersonalPreferences, setProfilePersonalPreferences] = useState<string[]>([]);
  const [profileEducation, setProfileEducation] = useState("");
  const [profileHasDrivingLicense, setProfileHasDrivingLicense] = useState<"" | "yes" | "no">("");
  const [profileHasOwnCar, setProfileHasOwnCar] = useState<"" | "yes" | "no">("");
  const [profileExperienceLevel, setProfileExperienceLevel] = useState("");
  const [profileDistrictCity, setProfileDistrictCity] = useState("");
  const [profileServiceAreas, setProfileServiceAreas] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileFieldErrors, setProfileFieldErrors] = useState<ProfileFieldErrors>({});
  const [profileSaved, setProfileSaved] = useState(false);
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState<string | null>(null);
  const [districtOverlayOpen, setDistrictOverlayOpen] = useState(false);
  const [districtSelectedZoneIds, setDistrictSelectedZoneIds] = useState<string[]>([]);
  const [districtZones, setDistrictZones] = useState<ServiceZone[]>([]);
  const [otherLanguagesOverlayOpen, setOtherLanguagesOverlayOpen] = useState(false);
  const [otherLanguageSearch, setOtherLanguageSearch] = useState("");
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cropImageElement, setCropImageElement] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState(PROFILE_CROP_MIN_ZOOM);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState("");
  const [cropDragging, setCropDragging] = useState(false);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const [applyJob, setApplyJob] = useState<CleaningJob | null>(null);
  const [applyPrice, setApplyPrice] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [completingJobId, setCompletingJobId] = useState<number | null>(null);
  const [cancelJobTarget, setCancelJobTarget] = useState<{ id: number; title: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<
    { jobId: number; jobTitle: string; revieweeId: number; revieweeName: string } | null
  >(null);
  const autoOpenedReviewJobIdRef = useRef<number | null>(null);
  const [cancelingApplicationId, setCancelingApplicationId] = useState<number | null>(null);
  const [offerActionId, setOfferActionId] = useState<number | null>(null);
  const [applicationActionError, setApplicationActionError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const requestedSection = searchParams.get("section");
  const reviewJobParam = searchParams.get("reviewJob");
  const requestedReviewJobId = reviewJobParam ? Number(reviewJobParam) : null;

  useEffect(() => {
    if (!requestedReviewJobId || Number.isNaN(requestedReviewJobId)) {
      autoOpenedReviewJobIdRef.current = null;
    }
  }, [requestedReviewJobId]);

  useEffect(() => {
    apiFetch("/api/accounts/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CurrentUser | null) => setMe(data))
      .finally(() => setLoadingMe(false));
  }, []);

  useEffect(() => {
    if (me?.role === "cleaner") void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => {
    if (me?.role === "cleaner" && me.is_approved) void loadCalendar(calYear, calMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, calYear, calMonth]);

  useEffect(() => {
    if (requestedSection === "assignments" || requestedSection === "applications") {
      setSection("applications");
    } else if (
      requestedSection === "calendar"
      || requestedSection === "offers"
      || requestedSection === "profile"
    ) {
      setSection(requestedSection);
    }
  }, [requestedSection]);

  useEffect(() => {
    if (!cropSource) {
      setCropImageElement(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setCropImageElement(image);
    image.onerror = () => setCropError(t("errors.loadImage"));
    image.src = cropSource.src;
  }, [cropSource]);

  useEffect(() => {
    if (!cropSource) return;
    setCropOffset((current) => {
      const constrained = clampProfileCropOffset(current, cropSource, cropZoom, PROFILE_CROP_PREVIEW_SIZE);
      if (constrained.x === current.x && constrained.y === current.y) return current;
      return constrained;
    });
  }, [cropSource, cropZoom]);

  useEffect(() => {
    drawCropPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropSource, cropImageElement, cropZoom, cropOffset]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!profileSaved) return;
    const timer = window.setTimeout(() => setProfileSaved(false), 5000);
    return () => window.clearTimeout(timer);
  }, [profileSaved]);

  useEffect(() => {
    if (!profileNativeLanguage) return;
    setProfileOtherLanguages((current) => current.filter((language) => language !== profileNativeLanguage));
  }, [profileNativeLanguage]);

  useEffect(() => {
    if (profileHasDrivingLicense !== "yes" && profileHasOwnCar !== "") {
      setProfileHasOwnCar("");
    }
  }, [profileHasDrivingLicense, profileHasOwnCar]);

  useEffect(() => {
    if (!isValidDateValue(profileBirthDate)) return;
    const [year, month] = profileBirthDate.split("-").map(Number);
    setProfileBirthCalendarPosition(year, month - 1);
    // This syncs one derived calendar position when the stored date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileBirthDate]);

  function clearProfileFieldError(field: ProfileFieldErrorKey) {
    setProfileFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function setProfileBirthCalendarPosition(year: number, month: number) {
    const clampedYear = Math.min(year, cutoffYear);
    const clampedMonth = clampedYear === cutoffYear ? Math.min(month, cutoffMonth) : month;
    setProfileBirthCalendarYear(clampedYear);
    setProfileBirthCalendarMonth(Math.max(0, Math.min(11, clampedMonth)));
  }

  function moveProfileBirthMonth(offset: number) {
    const next = new Date(profileBirthCalendarYear, profileBirthCalendarMonth + offset, 1);
    if (next.getFullYear() > cutoffYear) return;
    setProfileBirthCalendarPosition(next.getFullYear(), next.getMonth());
  }

  function selectProfileBirthDay(day: number) {
    const selected = new Date(profileBirthCalendarYear, profileBirthCalendarMonth, day);
    const value = dateValue(selected);
    if (!isAdultBirthDate(value)) return;
    setProfileBirthDate(value);
    setProfileBirthCalendarOpen(false);
    clearProfileFieldError("birth_date");
  }

  function changeProfileBirthDate(value: string) {
    setProfileBirthDate(value);
    if (!value) {
      clearProfileFieldError("birth_date");
      return;
    }
    if (isValidDateValue(value)) {
      const [year, month] = value.split("-").map(Number);
      setProfileBirthCalendarPosition(year, month - 1);
      if (isAdultBirthDate(value)) {
        clearProfileFieldError("birth_date");
      } else {
        setProfileFieldErrors((current) => ({
          ...current,
          birth_date: t("profileForm.errors.birthDateAge"),
        }));
      }
    }
  }

  function syncProfileForm(nextProfile: CleanerProfile, nextUserNames?: { first_name: string; last_name: string }) {
    const firstName = nextUserNames?.first_name ?? me?.first_name ?? "";
    const lastName = nextUserNames?.last_name ?? me?.last_name ?? "";
    const serviceAreasText = nextProfile.service_areas.join("\n");
    const savedCity = cities.find(
      (city) => city.label.toLowerCase() === (nextProfile.city || "").trim().toLowerCase(),
    )?.value;
    const inferredCity = savedCity ?? inferCityFromServiceAreas(serviceAreasText);

    setProfileFirstName(firstName);
    setProfileLastName(lastName);
    setProfileSex(nextProfile.sex || "prefer_not_to_say");
    setProfileBirthDate(nextProfile.birth_date || "");
    setProfileBirthCalendarOpen(false);
    setProfileNativeLanguage(nextProfile.native_language || "");
    setProfileOtherLanguages((nextProfile.other_languages || []).filter(Boolean));
    setProfilePersonalPreferences(sanitizePersonalPreferences((nextProfile.personal_preferences || []).filter(Boolean)));
    setProfileEducation(nextProfile.education || "");
    setProfileHasDrivingLicense(boolToChoice(nextProfile.has_driving_license));
    setProfileHasOwnCar(boolToChoice(nextProfile.has_own_car));
    setProfileExperienceLevel(nextProfile.experience_level || "");
    setProfileDistrictCity(inferredCity);
    setProfileServiceAreas(serviceAreasText);
    setProfileImage(nextProfile.profile_image || "");
    setProfileBio(nextProfile.bio || "");
    setProfileFieldErrors({});
    setSavedProfileSnapshot(buildProfileSnapshot({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      city: inferredCity,
      sex: nextProfile.sex || "prefer_not_to_say",
      birthDate: nextProfile.birth_date || "",
      nativeLanguage: (nextProfile.native_language || "").trim(),
      otherLanguages: JSON.stringify((nextProfile.other_languages || []).filter(Boolean)),
      personalPreferences: JSON.stringify(sanitizePersonalPreferences((nextProfile.personal_preferences || []).filter(Boolean))),
      education: nextProfile.education || "",
      hasDrivingLicense: boolToChoice(nextProfile.has_driving_license),
      hasOwnCar: boolToChoice(nextProfile.has_own_car),
      experienceLevel: nextProfile.experience_level || "",
      serviceAreas: normalizeServiceAreasText(serviceAreasText),
      profileImage: nextProfile.profile_image || "",
      bio: nextProfile.bio || "",
    }));
  }

  function calendarRange(year: number, month: number) {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 1).toISOString();
    return { start, end };
  }

  async function loadCalendar(year = calYear, month = calMonth, silent = false) {
    if (!silent) setLoadingCalendar(true);
    const range = calendarRange(year, month);
    try {
      const res = await apiFetch(
        `/api/marketplace/calendar/?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
      );
      if (res.ok) {
        const items = readList<CalendarItem>(await res.json());
        setCalendarItems(items.filter((item) => item.item_type === "assignment"));
      }
    } finally {
      if (!silent) setLoadingCalendar(false);
    }
  }

  async function loadAll(silent = false) {
    if (!silent) {
      setLoadingData(true);
      setDataError("");
    }
    try {
      const [profileRes, jobsRes, applicationsRes, assignmentsRes, reviewsRes] = await Promise.all([
        apiFetch("/api/accounts/cleaners/"),
        apiFetch("/api/marketplace/jobs/"),
        apiFetch("/api/marketplace/applications/"),
        apiFetch("/api/marketplace/assignments/"),
        apiFetch("/api/feedback/reviews/"),
      ]);

      if (profileRes.ok) {
        const data = readList<CleanerProfile>(await profileRes.json());
        const ownProfile = data[0] ?? null;
        setProfile(ownProfile);
        if (ownProfile) syncProfileForm(ownProfile, me ? { first_name: me.first_name, last_name: me.last_name } : undefined);
      } else {
        setDataError(t("errors.loadProfile"));
      }

      if (jobsRes.ok) {
        setJobs(readList<CleaningJob>(await jobsRes.json()));
      } else if (!dataError) {
        setDataError(t("errors.loadJobs"));
      }

      if (applicationsRes.ok) {
        setApplications(readList<CleanerApplication>(await applicationsRes.json()));
      }

      if (assignmentsRes.ok) {
        setAssignments(readList<AssignmentSummary>(await assignmentsRes.json()));
      }

      if (reviewsRes.ok) {
        setReviews(readList<Review>(await reviewsRes.json()));
      }
    } catch {
      if (!silent) {
        setDataError(t("errors.network"));
      }
    } finally {
      if (!silent) setLoadingData(false);
    }
  }

  useLiveRefresh(
    () => {
      if (me?.role !== "cleaner") return;
      void loadAll(true);
      if (me.is_approved) {
        void loadCalendar(calYear, calMonth, true);
      }
    },
    { enabled: me?.role === "cleaner" },
  );

  async function logout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    window.location.href = "/";
  }

  function openProfileFromMenu() {
    setSection("profile");
    setAccountMenuOpen(false);
  }

  async function changePreferredLanguage(preferredLanguage: "bg" | "en") {
    if (!me) return;
    const response = await apiFetch(`/api/accounts/users/${me.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ preferred_language: preferredLanguage }),
    });
    if (response.ok) {
      setMe((await response.json()) as CurrentUser);
      const query = searchParams.toString();
      localeRouter.replace(query ? `${localePathname}?${query}` : localePathname, {
        locale: preferredLanguage,
      });
    }
  }

  function openApply(job: CleaningJob) {
    if (shouldSuppressModalOpen()) return;
    setApplyJob(job);
    setApplyPrice(job.proposed_price ?? "");
    setApplyMessage("");
    setApplyError("");
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!applyJob) return;
    setApplying(true);
    setApplyError("");
    try {
      const res = await apiFetch("/api/marketplace/applications/", {
        method: "POST",
        body: JSON.stringify({
          job_id: applyJob.id,
          proposed_price: applyPrice || null,
          message: applyMessage,
        }),
      });
      if (!res.ok) {
        setApplyError(messageFromResponse(await res.json(), t("errors.submitApplication")));
        return;
      }
      const application = (await res.json()) as CleanerApplication;
      setApplications((prev) => [application, ...prev]);
      setApplyJob(null);
      void loadCalendar();
    } finally {
      setApplying(false);
    }
  }

  async function completeJob(jobId: number) {
    setCompletingJobId(jobId);
    try {
      const res = await apiFetch(`/api/marketplace/jobs/${jobId}/complete/`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as CleaningJob;
        setJobs((prev) => prev.map((job) => (job.id === updated.id ? updated : job)));
        void loadAll();
        void loadCalendar();
      }
    } finally {
      setCompletingJobId(null);
    }
  }

  // Open the review window for this completed job (cleaner reviews the host).
  function openReview(assignment: AssignmentSummary, hostId: number) {
    if (shouldSuppressModalOpen()) return;
    const job = jobById.get(assignment.job);
    setReviewTarget({
      jobId: assignment.job,
      jobTitle: t("apps.openJobs.jobFallback"),
      revieweeId: hostId,
      revieweeName: job?.host_name || "the host",
    });
  }

  function closeReviewModal() {
    setReviewTarget(null);
    if (!reviewJobParam) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("reviewJob");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  async function cancelApplication(applicationId: number) {
    setCancelingApplicationId(applicationId);
    setApplicationActionError("");
    try {
      const res = await apiFetch(`/api/marketplace/applications/${applicationId}/withdraw/`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApplicationActionError(messageFromResponse(data, t("profileForm.errors.cancelApplication")));
        return;
      }
      const updated = data as CleanerApplication;
      setApplications((prev) => prev.map((application) => (application.id === updated.id ? updated : application)));
      void loadCalendar();
    } finally {
      setCancelingApplicationId(null);
    }
  }

  async function acceptOffer(applicationId: number) {
    setOfferActionId(applicationId);
    setApplicationActionError("");
    try {
      const res = await apiFetch(`/api/marketplace/applications/${applicationId}/accept-offer/`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApplicationActionError(messageFromResponse(data, t("profileForm.errors.acceptOffer")));
        return;
      }
      void loadAll();
      void loadCalendar();
    } finally {
      setOfferActionId(null);
    }
  }

  async function declineOffer(applicationId: number) {
    setOfferActionId(applicationId);
    setApplicationActionError("");
    try {
      const res = await apiFetch(`/api/marketplace/applications/${applicationId}/decline-offer/`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApplicationActionError(messageFromResponse(data, t("profileForm.errors.declineOffer")));
        return;
      }
      const updated = data as CleanerApplication;
      setApplications((prev) => prev.map((application) => (application.id === updated.id ? updated : application)));
      void loadCalendar();
    } finally {
      setOfferActionId(null);
    }
  }

  function closeCropEditor() {
    setCropSource(null);
    setCropImageElement(null);
    setCropZoom(PROFILE_CROP_MIN_ZOOM);
    setCropOffset({ x: 0, y: 0 });
    setCropBusy(false);
    setCropError("");
    setCropDragging(false);
    cropDragStateRef.current = null;
  }

  function resetCropPosition() {
    setCropOffset({ x: 0, y: 0 });
  }

  function setCropZoomLevel(nextZoom: number) {
    const normalizedZoom = clamp(nextZoom, PROFILE_CROP_MIN_ZOOM, PROFILE_CROP_MAX_ZOOM);
    setCropZoom(normalizedZoom);
    if (!cropSource) return;
    setCropOffset((current) => clampProfileCropOffset(current, cropSource, normalizedZoom, PROFILE_CROP_PREVIEW_SIZE));
  }

  function drawCropPreview() {
    if (!cropSource || !cropImageElement) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const canvasSize = PROFILE_CROP_PREVIEW_SIZE;
    const constrainedOffset = clampProfileCropOffset(cropOffset, cropSource, cropZoom, canvasSize);

    context.clearRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvasSize, canvasSize);

    const scale = profileCropBaseScale(cropSource, canvasSize) * cropZoom;
    const drawWidth = cropSource.width * scale;
    const drawHeight = cropSource.height * scale;
    const drawX = (canvasSize - drawWidth) / 2 + constrainedOffset.x;
    const drawY = (canvasSize - drawHeight) / 2 + constrainedOffset.y;
    context.drawImage(cropImageElement, drawX, drawY, drawWidth, drawHeight);
  }

  function applyCropResult() {
    if (!cropSource || !cropImageElement) return;

    setCropBusy(true);
    setCropError("");

    try {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = PROFILE_CROP_EXPORT_SIZE;
      outputCanvas.height = PROFILE_CROP_EXPORT_SIZE;
      const context = outputCanvas.getContext("2d");
      if (!context) {
        setCropError(t("profileForm.errors.cropPrepare"));
        setCropBusy(false);
        return;
      }

      const constrainedOffset = clampProfileCropOffset(cropOffset, cropSource, cropZoom, PROFILE_CROP_PREVIEW_SIZE);
      const ratio = PROFILE_CROP_EXPORT_SIZE / PROFILE_CROP_PREVIEW_SIZE;
      const scale = profileCropBaseScale(cropSource, PROFILE_CROP_EXPORT_SIZE) * cropZoom;
      const drawWidth = cropSource.width * scale;
      const drawHeight = cropSource.height * scale;
      const drawX = (PROFILE_CROP_EXPORT_SIZE - drawWidth) / 2 + constrainedOffset.x * ratio;
      const drawY = (PROFILE_CROP_EXPORT_SIZE - drawHeight) / 2 + constrainedOffset.y * ratio;

      context.clearRect(0, 0, PROFILE_CROP_EXPORT_SIZE, PROFILE_CROP_EXPORT_SIZE);
      context.drawImage(cropImageElement, drawX, drawY, drawWidth, drawHeight);

      setProfileImage(outputCanvas.toDataURL("image/jpeg", 0.92));
      closeCropEditor();
    } catch {
      setCropError(t("profileForm.errors.cropApply"));
      setCropBusy(false);
    }
  }

  function onCropPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!cropSource) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    cropDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };
    setCropDragging(true);
  }

  function onCropPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!cropSource) return;
    const dragState = cropDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffset = clampProfileCropOffset(
      {
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      },
      cropSource,
      cropZoom,
      PROFILE_CROP_PREVIEW_SIZE,
    );
    setCropOffset(nextOffset);
  }

  function onCropPointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    const dragState = cropDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragStateRef.current = null;
    setCropDragging(false);
  }

  function onProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const issue = validateImageFile(file, CLEANER_IMAGE_MAX_BYTES);
    if (issue) {
      setProfileError("");
      setProfileFieldErrors((current) => ({
        ...current,
        profile_image: t(issue === "too_large" ? "errors.imageTooLarge" : "errors.invalidImage"),
      }));
      event.target.value = "";
      return;
    }

    setProfileError("");
    clearProfileFieldError("profile_image");
    setProfileSaved(false);
    setCropError("");
    setCropBusy(false);
    setCropZoom(PROFILE_CROP_MIN_ZOOM);
    setCropOffset({ x: 0, y: 0 });

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const image = new window.Image();
        image.onload = () => {
          setCropSource({
            src: reader.result as string,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        };
        image.onerror = () => {
          setProfileError("");
          setProfileFieldErrors((current) => ({
            ...current,
            profile_image: t("errors.openImage"),
          }));
        };
        image.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function patchCleanerProfile(
    payload: Record<string, unknown>,
    fallbackError: string,
    nextUserNames?: { first_name: string; last_name: string },
  ) {
    if (!profile) return false;
    const res = await apiFetch(`/api/accounts/cleaners/${profile.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const { fieldErrors, formError } = extractFieldErrors(
        data,
        {
          service_areas: "service_areas",
          sex: "sex",
          birth_date: "birth_date",
          native_language: "native_language",
          other_languages: "other_languages",
          personal_preferences: "personal_preferences",
          education: "education",
          experience_level: "experience_level",
          has_driving_license: "has_driving_license",
          has_own_car: "has_own_car",
          profile_image: "profile_image",
          bio: "bio",
        },
        fallbackError,
      );
      setProfileFieldErrors((current) => ({ ...current, ...fieldErrors }));
      setProfileError(Object.keys(fieldErrors).length > 0 ? "" : formError);
      return false;
    }
    const updated = (await res.json()) as CleanerProfile;
    setProfile(updated);
    syncProfileForm(updated, nextUserNames);
    return true;
  }

  async function submitAllProfileChanges(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!profile || !me) return;
    const serviceAreas = normalizeServiceAreasByCity(profileServiceAreas, profileDistrictCity);
    const nextFieldErrors: ProfileFieldErrors = {};
    if (!profileFirstName.trim()) nextFieldErrors.first_name = t("profileForm.errors.firstNameRequired");
    if (!profileLastName.trim()) nextFieldErrors.last_name = t("profileForm.errors.lastNameRequired");
    if (!profileBirthDate) nextFieldErrors.birth_date = t("profileForm.errors.birthDateRequired");
    else if (!isValidDateValue(profileBirthDate)) nextFieldErrors.birth_date = t("profileForm.errors.birthDateInvalid");
    else if (!isAdultBirthDate(profileBirthDate)) nextFieldErrors.birth_date = t("profileForm.errors.birthDateAge");
    if (!profileDistrictCity) nextFieldErrors.district_city = t("profileForm.errors.districtCityRequired");
    if (serviceAreas.length === 0) nextFieldErrors.service_areas = t("profileForm.errors.serviceAreasRequired");
    if (Object.keys(nextFieldErrors).length > 0) {
      setProfileFieldErrors(nextFieldErrors);
      setProfileError("");
      return;
    }
    setProfileServiceAreas(serviceAreas.join("\n"));

    setSavingProfile(true);
    setProfileError("");
    setProfileFieldErrors({});
    setProfileSaved(false);
    try {
      const userRes = await apiFetch(`/api/accounts/users/${me.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: profileFirstName.trim(),
          last_name: profileLastName.trim(),
        }),
      });
      if (!userRes.ok) {
        const data = await userRes.json().catch(() => null);
        const { fieldErrors, formError } = extractFieldErrors(
          data,
          {
            first_name: "first_name",
            last_name: "last_name",
          },
          t("profileForm.errors.saveName"),
        );
        setProfileFieldErrors((current) => ({ ...current, ...fieldErrors }));
        setProfileError(Object.keys(fieldErrors).length > 0 ? "" : formError);
        return;
      }
      const updatedUser = (await userRes.json()) as CurrentUser;
      setMe(updatedUser);

      const success = await patchCleanerProfile(
        {
          service_areas: serviceAreas,
          city: selectedDistrictCity?.label ?? "",
          sex: profileSex,
          birth_date: profileBirthDate || null,
          native_language: profileNativeLanguage.trim(),
          other_languages: profileOtherLanguages,
          personal_preferences: profilePersonalPreferences,
          education: profileEducation,
          has_driving_license: choiceToBool(profileHasDrivingLicense),
          has_own_car: profileHasDrivingLicense === "yes" ? choiceToBool(profileHasOwnCar) : null,
          experience_level: profileExperienceLevel,
          profile_image: profileImage,
          bio: profileBio,
        },
        t("profileForm.errors.saveProfile"),
        { first_name: updatedUser.first_name, last_name: updatedUser.last_name },
      );
      if (success) setProfileSaved(true);
    } finally {
      setSavingProfile(false);
    }
  }

  function preventCategoryFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  const selectedDistrictCity = useMemo(
    () => cities.find((item) => item.value === profileDistrictCity) ?? null,
    [profileDistrictCity],
  );

  function openDistrictOverlay() {
    if (!selectedDistrictCity) {
      setProfileError("");
      setProfileFieldErrors((current) => ({ ...current, district_city: t("profileForm.errors.chooseCityFirst") }));
      return;
    }
    const fallbackZones = fallbackServiceZones(selectedDistrictCity.value);
    setDistrictZones(fallbackZones);
    setDistrictSelectedZoneIds(serviceAreaNamesToZoneIds(serviceAreasFromText(profileServiceAreas), fallbackZones));
    setDistrictOverlayOpen(true);
    setProfileError("");
    clearProfileFieldError("district_city");
  }

  function closeDistrictOverlay() {
    setDistrictOverlayOpen(false);
  }

  function applyDistrictsToServiceAreas() {
    if (!selectedDistrictCity) return;
    const zonesForApply = districtZones.length > 0 ? districtZones : fallbackServiceZones(selectedDistrictCity.value);
    const nextAreas = zoneIdsToServiceAreaNames(districtSelectedZoneIds, zonesForApply);
    setProfileServiceAreas(nextAreas.join("\n"));
    closeDistrictOverlay();
  }

  function handleDistrictSelectorChange(nextZoneIds: string[]) {
    setDistrictSelectedZoneIds(nextZoneIds);
  }

  function handleDistrictZonesLoaded(zones: ServiceZone[]) {
    setDistrictZones(zones);
    const selectedFromProfile = serviceAreaNamesToZoneIds(serviceAreasFromText(profileServiceAreas), zones);
    if (selectedFromProfile.length > 0) {
      setDistrictSelectedZoneIds(selectedFromProfile);
    }
  }

  const availableOtherLanguageOptions = useMemo(() => {
    const selected = new Set(profileOtherLanguages);
    const normalizedNative = profileNativeLanguage.trim();
    return otherLanguageCatalog.filter((language) => {
      if (selected.has(language)) return false;
      if (normalizedNative && language === normalizedNative) return false;
      return true;
    });
  }, [profileOtherLanguages, profileNativeLanguage]);

  const filteredAvailableOtherLanguageOptions = useMemo(() => {
    const query = otherLanguageSearch.trim().toLocaleLowerCase();
    if (!query) return availableOtherLanguageOptions;
    return availableOtherLanguageOptions.filter((language) => language.toLocaleLowerCase().includes(query));
  }, [availableOtherLanguageOptions, otherLanguageSearch]);

  function openOtherLanguagesOverlay() {
    setOtherLanguageSearch("");
    setOtherLanguagesOverlayOpen(true);
  }

  function closeOtherLanguagesOverlay() {
    setOtherLanguageSearch("");
    setOtherLanguagesOverlayOpen(false);
  }

  function addOtherLanguage(language: string) {
    setProfileOtherLanguages((current) => {
      if (current.includes(language)) return current;
      return [...current, language];
    });
  }

  function removeOtherLanguage(language: string) {
    setProfileOtherLanguages((current) => current.filter((item) => item !== language));
  }

  function togglePersonalPreference(value: string) {
    setProfilePersonalPreferences((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  }

  const applicationsByJob = useMemo(() => {
    const map = new Map<number, CleanerApplication>();
    for (const application of applications) {
      if (application.status === "withdrawn") continue;
      map.set(application.job, application);
    }
    return map;
  }, [applications]);

  const jobById = useMemo(() => {
    const map = new Map<number, CleaningJob>();
    for (const job of jobs) {
      map.set(job.id, job);
    }
    return map;
  }, [jobs]);

  const myProperties = useMemo(() => {
    const map = new Map<string, { id: string; name: string; city: string; hostName: string; jobIds: Set<number> }>();
    for (const assignment of assignments) {
      const job = jobById.get(assignment.job);
      if (!job?.property_name) continue;
      const identity = `${job.property_name}\u0000${job.property_address || ""}`;
      const existing = map.get(identity);
      if (existing) {
        existing.jobIds.add(job.id);
        continue;
      }
      map.set(identity, {
        id: `property-${map.size + 1}`,
        name: job.property_name,
        city: job.city_name_bg || job.city_name_en || "",
        hostName: job.host_name || t("profileForm.fallbackHostName"),
        jobIds: new Set([job.id]),
      });
    }
    return Array.from(map.values());
  }, [assignments, jobById, t]);

  const scopedJobIds = useMemo(() => {
    if (!selectedPropertyKey) return null;
    return myProperties.find((property) => property.id === selectedPropertyKey)?.jobIds ?? null;
  }, [myProperties, selectedPropertyKey]);

  const openJobs = useMemo(() => {
    let result = jobs.filter((job) => job.status === "open");
    if (jobCityFilter) {
      result = result.filter((job) => (
        job.city_name_bg || job.city_name_en || ""
      ).toLowerCase() === jobCityFilter.toLowerCase());
    }
    return result.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  }, [jobs, jobCityFilter]);

  const availableJobCities = useMemo(() => {
    const cities = new Set<string>();
    jobs.filter((job) => job.status === "open").forEach((job) => {
      const city = job.city_name_bg || job.city_name_en;
      if (city) cities.add(city);
    });
    return Array.from(cities).sort();
  }, [jobs]);

  const activeAssignments = useMemo(
    () => assignments.filter((a) => !a.completed_at && !a.cancelled_at && (!scopedJobIds || scopedJobIds.has(a.job))),
    [assignments, scopedJobIds],
  );
  const completedAssignments = useMemo(
    () => assignments.filter((a) => Boolean(a.completed_at) && (!scopedJobIds || scopedJobIds.has(a.job))),
    [assignments, scopedJobIds],
  );

  /** Total income = sum of agreed_price across fully-completed assignments. */
  const totalIncome = useMemo(
    () => completedAssignments.reduce((sum, a) => sum + Number(a.agreed_price ?? 0), 0),
    [completedAssignments],
  );

  // A review notification (?reviewJob=) opens the review window for that job.
  useEffect(() => {
    if (!requestedReviewJobId || Number.isNaN(requestedReviewJobId)) return;
    if (autoOpenedReviewJobIdRef.current === requestedReviewJobId) return;
    const targetAssignment = assignments.find((a) => a.job === requestedReviewJobId);
    const targetJob = jobs.find((job) => job.id === requestedReviewJobId);
    if (!targetAssignment || !targetJob?.host) return;
    const isComplete =
      Boolean(targetAssignment.completed_at) ||
      targetJob.status === "completed";
    if (!isComplete) return;

    autoOpenedReviewJobIdRef.current = requestedReviewJobId;
    setSection("applications");
    setReviewTarget({
      jobId: requestedReviewJobId,
      jobTitle: t("apps.openJobs.jobFallback"),
      revieweeId: targetJob.host,
      revieweeName: targetJob.host_name || "the host",
    });
  }, [assignments, jobs, requestedReviewJobId]);

  const blanks = firstWeekday(calYear, calMonth);
  const totalDays = daysInMonth(calYear, calMonth);
  const monthPrefix = `${calYear}-${pad(calMonth + 1)}-`;

  const scopedCalendarItems = useMemo(
    () => (scopedJobIds ? calendarItems.filter((item) => scopedJobIds.has(item.job)) : calendarItems),
    [calendarItems, scopedJobIds],
  );

  const calendarItemsByDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const item of scopedCalendarItems) {
      const ds = dateOnly(item.scheduled_start);
      if (ds.startsWith(monthPrefix)) {
        const day = parseInt(ds.slice(8), 10);
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(item);
      }
    }
    for (const dayItems of map.values()) {
      dayItems.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
    }
    return map;
  }, [scopedCalendarItems, monthPrefix]);

  const visibleCalendarItems = useMemo(() => {
    if (selectedDay !== null) {
      const target = `${monthPrefix}${pad(selectedDay)}`;
      return scopedCalendarItems.filter((item) => dateOnly(item.scheduled_start) === target);
    }
    return [...scopedCalendarItems].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  }, [scopedCalendarItems, monthPrefix, selectedDay]);
  const incompleteCalendarItemCount = scopedCalendarItems.filter(
    (item) => !item.completed_at && item.status !== "completed",
  ).length;

  function prevMonth() {
    setSelectedDay(null);
    if (calMonth === 0) {
      setCalYear((year) => year - 1);
      setCalMonth(11);
    } else {
      setCalMonth((month) => month - 1);
    }
  }

  function nextMonth() {
    setSelectedDay(null);
    if (calMonth === 11) {
      setCalYear((year) => year + 1);
      setCalMonth(0);
    } else {
      setCalMonth((month) => month + 1);
    }
  }

  const canApply = Boolean(me?.is_approved && profile?.is_verified);
  const pendingOffers = applications.filter(
    (application) => application.origin === "host_offered" && application.status === "pending",
  );
  const selfApplications = applications.filter(
    (application) => application.origin !== "host_offered" && (!scopedJobIds || scopedJobIds.has(application.job)),
  );
  const pendingSelfApplications = selfApplications
    .filter((application) => application.status === "pending")
    .sort((a, b) => (
      a.job_summary?.scheduled_start ?? ""
    ).localeCompare(b.job_summary?.scheduled_start ?? ""));
  const pendingApplications = pendingSelfApplications.length;
  const myReceivedReviews = reviews.filter((review) => review.reviewee === (me?.id ?? -1));
  const myRatingAvg = myReceivedReviews.length > 0
    ? myReceivedReviews.reduce((sum, review) => sum + review.rating, 0) / myReceivedReviews.length
    : null;
  const fullName = `${me?.first_name || ""} ${me?.last_name || ""}`.trim();
  const displayName = fullName || me?.email.split("@")[0] || t("profileForm.fallbackDisplayName");
  const currentProfileSnapshot = useMemo(
    () => buildProfileSnapshot({
      firstName: profileFirstName.trim(),
      lastName: profileLastName.trim(),
      city: profileDistrictCity,
      sex: profileSex,
      birthDate: profileBirthDate || "",
      nativeLanguage: profileNativeLanguage.trim(),
      otherLanguages: JSON.stringify(profileOtherLanguages),
      personalPreferences: JSON.stringify([...profilePersonalPreferences].sort()),
      education: profileEducation,
      hasDrivingLicense: profileHasDrivingLicense,
      hasOwnCar: profileHasOwnCar,
      experienceLevel: profileExperienceLevel,
      serviceAreas: normalizeServiceAreasText(profileServiceAreas),
      profileImage: profileImage || "",
      bio: profileBio,
    }),
    [
      profileFirstName,
      profileLastName,
      profileDistrictCity,
      profileSex,
      profileBirthDate,
      profileNativeLanguage,
      profileOtherLanguages,
      profilePersonalPreferences,
      profileEducation,
      profileHasDrivingLicense,
      profileHasOwnCar,
      profileExperienceLevel,
      profileServiceAreas,
      profileImage,
      profileBio,
    ],
  );
  const normalizedServiceAreasForSave = useMemo(
    () => normalizeServiceAreasByCity(profileServiceAreas, profileDistrictCity),
    [profileServiceAreas, profileDistrictCity],
  );
  const hasSelectedDistricts = normalizedServiceAreasForSave.length > 0;
  const hasProfileChanges = Boolean(savedProfileSnapshot && currentProfileSnapshot !== savedProfileSnapshot);

  if (loadingMe) {
    return <main className="host-page cleaner-page"><p className="host-loading">{t("gates.loading")}</p></main>;
  }

  if (!me) {
    return (
      <main className="host-page cleaner-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.notLoggedIn.eyebrow")}</p>
          <h1>{t("gates.notLoggedIn.heading")}</h1>
          <Link className="primary-link" href="/login">{t("gates.notLoggedIn.link")}</Link>
        </section>
      </main>
    );
  }

  if (me.role !== "cleaner") {
    return (
      <main className="host-page cleaner-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.wrongRole.eyebrow")}</p>
          <h1>{t("gates.wrongRole.heading")}</h1>
          <p>{t("gates.wrongRole.body")}</p>
          <Link className="secondary-link" href="/app">{t("gates.wrongRole.link")}</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="host-topbar cleaner-topbar">
        <Link className="site-brand" href="/">
          <span className="brand-symbol"><HomeIcon size={18} aria-hidden /></span>
          <strong>{tNav("brandName")}</strong>
        </Link>

        <nav className="host-section-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={`host-tab${section === "calendar" ? " active" : ""}`}
            onClick={() => setSection("calendar")}
          >
            <CalendarDays size={15} aria-hidden />
            {t("topbar.calendarTab")}
            {incompleteCalendarItemCount > 0 && <span className="host-tab-count">{incompleteCalendarItemCount}</span>}
          </button>
          <button
            type="button"
            className={`host-tab${section === "applications" ? " active" : ""}`}
            onClick={() => setSection("applications")}
          >
            <ClipboardList size={15} aria-hidden />
            {t("topbar.applicationsTab")}
            {pendingApplications + activeAssignments.length > 0 && (
              <span className="host-tab-count">{pendingApplications + activeAssignments.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`host-tab${section === "offers" ? " active" : ""}`}
            onClick={() => setSection("offers")}
          >
            <Gift size={15} aria-hidden />
            {t("topbar.offersTab")}
            {pendingOffers.length > 0 && <span className="host-tab-count host-tab-count--gold">{pendingOffers.length}</span>}
          </button>
          <Connections meId={me.id} />
        </nav>

        <div className="host-topbar-right">
          <NotificationBell />
          <div className="cleaner-account-menu" ref={accountMenuRef}>
            <button
              className="cleaner-account-menu-trigger"
              type="button"
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={t("topbar.accountMenuAriaLabel")}
            >
              <User size={18} aria-hidden />
            </button>
            {accountMenuOpen ? (
              <div className="cleaner-account-menu-dropdown" role="menu" aria-label={t("topbar.accountMenuAriaLabel")}>
                <div className="cleaner-account-menu-identity">
                  <strong>{displayName}</strong>
                  <span>{t("topbar.role")}</span>
                </div>
                <button type="button" className="cleaner-account-menu-item" role="menuitem" onClick={openProfileFromMenu}>
                  <UserRoundCheck size={16} aria-hidden />
                  {t("topbar.profile")}
                </button>
                <div className="account-language-picker">
                  <span>{t("topbar.language")}</span>
                  <div className="account-language-slider" role="group" aria-label={t("topbar.language")}>
                    <button
                      type="button"
                      className={me.preferred_language === "bg" ? "active" : ""}
                      aria-pressed={me.preferred_language === "bg"}
                      onClick={() => void changePreferredLanguage("bg")}
                    >
                      BG
                    </button>
                    <button
                      type="button"
                      className={me.preferred_language === "en" ? "active" : ""}
                      aria-pressed={me.preferred_language === "en"}
                      onClick={() => void changePreferredLanguage("en")}
                    >
                      EN
                    </button>
                  </div>
                </div>
                <button type="button" className="cleaner-account-menu-item cleaner-account-menu-item--danger" role="menuitem" onClick={() => void logout()}>
                  <LogOut size={16} aria-hidden />
                  {t("topbar.logOut")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="host-page cleaner-page">
        <div className="host-workspace">

        {/* ── Property navigation rail (desktop) ── */}
        {me.is_approved && section !== "profile" && myProperties.length > 0 && (
          <aside
            className={`host-rail${railExpanded ? " host-rail--expanded" : " host-rail--mini"}`}
            aria-label={t("rail.ariaLabel")}
          >
            <div className="host-rail-head">
              <button
                type="button"
                className="host-rail-toggle"
                onClick={() => setRailExpanded((v) => !v)}
                title={railExpanded ? t("rail.collapseAriaLabel") : t("rail.expandAriaLabel")}
                aria-label={railExpanded ? t("rail.collapseAriaLabel") : t("rail.expandAriaLabel")}
              >
                {railExpanded ? <ChevronLeft size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
              </button>
            </div>

            <button
              type="button"
              className={`host-rail-card host-rail-card--btn${selectedPropertyKey == null ? " host-rail-card--active" : ""}`}
              onClick={() => setSelectedPropertyKey(null)}
              title={t("rail.allProperties")}
              aria-label={t("rail.allProperties")}
            >
              <span className="host-rail-thumb host-rail-thumb--icon">
                <LayoutGrid size={22} aria-hidden />
              </span>
              <span className="host-rail-card-text host-rail-fade">
                <span className="host-rail-card-name">{t("rail.allProperties")}</span>
              </span>
            </button>

            <div className="host-rail-list">
              {myProperties.map((p) => (
                <div key={p.id} className={`host-rail-card${selectedPropertyKey === p.id ? " host-rail-card--active" : ""}`}>
                  <button
                    type="button"
                    className="host-rail-card-main"
                    onClick={() => setSelectedPropertyKey(p.id)}
                    title={p.name}
                    aria-label={p.name}
                  >
                    <span className="host-rail-thumb">
                      <span className="host-rail-thumb--empty"><Building2 size={22} aria-hidden /></span>
                    </span>
                    <span className="host-rail-card-text host-rail-fade">
                      <span className="host-rail-card-name">{p.name}</span>
                      {p.city && <span className="host-rail-card-city">{p.city}</span>}
                      <span className="host-rail-card-city" style={{ color: "var(--muted)", fontSize: "11px" }}>{p.hostName}</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="host-workspace-main">

        {/* ── Property selector (mobile — rail collapses to a dropdown) ── */}
        {me.is_approved && section !== "profile" && myProperties.length > 0 && (
          <div className="host-rail-mobile">
            <select
              className="host-rail-mobile-select"
              value={selectedPropertyKey ?? ""}
              onChange={(e) => setSelectedPropertyKey(e.target.value || null)}
              aria-label={t("rail.filterAriaLabel")}
            >
              <option value="">{t("rail.allProperties")}</option>
              {myProperties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.hostName ? ` (${p.hostName})` : ""}</option>
              ))}
            </select>
          </div>
        )}

        {!me.is_approved && (
          <div className="host-pending-banner">
            {t("pendingBanner")}
          </div>
        )}
        {me.is_approved && profile && !profile.is_verified && (
          <div className="host-pending-banner cleaner-verification-banner">
            {t("verificationBanner")}
          </div>
        )}
        <VerificationStatusSummary
          user={me}
          cleanerMarketplaceStatus={profile?.verification_status}
          compact
        />
        {dataError && <p className="form-error cleaner-page-error">{dataError}</p>}

        {section === "calendar" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("calendar.eyebrow")}</p>
                <h1 className="host-section-title">{t("calendar.title")}</h1>
              </div>
              <button
                className="secondary-link admin-refresh-button"
                type="button"
                onClick={() => {
                  void loadAll();
                  void loadCalendar();
                }}
                disabled={loadingData || loadingCalendar}
              >
                <RefreshCcw size={15} aria-hidden />
                {loadingData || loadingCalendar ? t("calendar.loading") : t("calendar.refresh")}
              </button>
            </div>

            {!me.is_approved ? (
              <div className="host-empty-state">
                <CalendarDays size={40} />
                <p>{t("calendar.notApproved")}</p>
              </div>
            ) : (
              <div className="host-jobs-layout cleaner-calendar-layout">
                <div className="host-calendar">
                  <div className="host-cal-nav">
                    <button type="button" className="host-cal-arrow" onClick={prevMonth} aria-label={t("calendar.prevMonth")}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="host-cal-title">{MONTHS[calMonth]} {calYear}</span>
                    <button type="button" className="host-cal-arrow" onClick={nextMonth} aria-label={t("calendar.nextMonth")}>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="host-cal-grid">
                    {DAYS.map((day) => (
                      <div key={day} className="host-cal-day-header">{day}</div>
                    ))}
                    {Array.from({ length: blanks }).map((_, index) => (
                      <div key={`blank-${index}`} className="host-cal-blank" />
                    ))}
                    {Array.from({ length: totalDays }, (_, index) => index + 1).map((day) => {
                      const dayItems = calendarItemsByDay.get(day) ?? [];
                      const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
                      const isSelected = day === selectedDay;
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`host-cal-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                          onClick={() => setSelectedDay(isSelected ? null : day)}
                          title={dayItems.length > 0 ? t("calendar.calItemTooltip", { count: dayItems.length }) : t("calendar.noItemsTooltip")}
                        >
                          <span className="host-cal-day-num">{day}</span>
                          <div className="host-cal-thumbs">
                            {dayItems.slice(0, 3).map((item) => (
                              <span
                                key={item.id}
                                className="host-cal-thumb"
                                style={{ boxShadow: `inset 0 0 0 1.5px ${calendarItemColor(item)}` }}
                              >
                                {item.property_image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.property_image} alt="" loading="lazy" decoding="async" />
                                ) : (
                                  <span className="host-cal-thumb--icon">
                                    <Building2 size={15} aria-hidden />
                                  </span>
                                )}
                              </span>
                            ))}
                            {dayItems.length > 3 && (
                              <span className="host-cal-thumb-more">+{dayItems.length - 3}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="host-job-panel">
                  <div className="host-job-panel-header">
                    <strong>
                      {selectedDay
                        ? `${MONTHS[calMonth]} ${selectedDay}, ${calYear}`
                        : `${MONTHS[calMonth]} ${calYear}`}
                    </strong>
                    {selectedDay !== null && (
                      <button className="host-clear-day" type="button" onClick={() => setSelectedDay(null)}>
                        <X size={13} aria-hidden />
                        {t("calendar.showAll")}
                      </button>
                    )}
                  </div>

                  {loadingCalendar ? (
                    <p className="host-empty cleaner-calendar-loading">{t("calendar.loading")}</p>
                  ) : visibleCalendarItems.length === 0 ? (
                    <div className="host-job-empty">
                      <p>{selectedDay ? t("calendar.noItemsDay") : t("calendar.noItemsMonth")}</p>
                    </div>
                  ) : (
                    <ul className="host-job-list">
                      {visibleCalendarItems.map((item) => {
                        const linkedJob = jobById.get(item.job);
                        const itemCanApply = Boolean(canApply && item.can_apply && linkedJob);
                        return (
                          <li key={item.id} className="host-job-item cleaner-calendar-item">
                            <span
                              className="host-job-dot"
                              style={{ background: calendarItemColor(item) }}
                            />
                            <div className="host-job-info">
                              <strong>{t("apps.openJobs.jobFallback")}</strong>
                              <span className="host-job-property">
                                {calendarPlace(item)}
                              </span>
                              <span className="host-job-time">
                                {fmtDateTime(item.scheduled_start)} - {fmtTime(item.scheduled_end)}
                              </span>
                            </div>
                            <div className="host-job-right">
                              <span
                                className={`cleaner-application-chip cleaner-calendar-chip cleaner-calendar-${item.item_type}${item.item_type === "application" && item.application_status ? ` cleaner-calendar-application-${item.application_status}` : ""}`}
                              >
                                {item.item_type === "application" && item.application_status
                                  ? APPLICATION_LABEL[item.application_status]
                                  : item.item_type === "assignment" && (item.completed_at || item.status === "completed")
                                    ? t("calendar.completed")
                                    : CALENDAR_LABEL[item.item_type]}
                              </span>
                              {(item.agreed_price || item.proposed_price) && (
                                <span className="host-job-price">
                                  {money(item.agreed_price || item.proposed_price, item.currency)}
                                </span>
                              )}
                              {itemCanApply && linkedJob && (
                                <button
                                  className="host-publish-btn"
                                  type="button"
                                  onClick={() => openApply(linkedJob)}
                                >
                                  {t("calendar.apply")}
                                </button>
                              )}
                              {item.can_complete && isPastDateTime(item.scheduled_start, now) && (
                                <button
                                  className="host-publish-btn cleaner-calendar-done"
                                  type="button"
                                  disabled={completingJobId === item.job}
                                  onClick={() => void completeJob(item.job)}
                                >
                                  {completingJobId === item.job ? t("calendar.saving") : t("calendar.markDone")}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {section === "applications" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("apps.eyebrow")}</p>
                <h1 className="host-section-title">{t("apps.title")}</h1>
              </div>
              <div className="cleaner-apps-header-actions">
                {!loadingData && (
                  <button
                    type="button"
                    className="secondary-link host-appdash-edit-btn"
                    onClick={() => appdash.setEditing(!appdash.editing)}
                  >
                    {appdash.editing ? t("apps.doneEditing") : t("apps.editCards")}
                  </button>
                )}
                <button
                  className="secondary-link admin-refresh-button"
                  type="button"
                  onClick={() => void loadAll()}
                  disabled={loadingData}
                >
                  <RefreshCcw size={15} aria-hidden />
                  {loadingData ? t("apps.loading") : t("apps.refresh")}
                </button>
              </div>
            </div>

            {!loadingData && (
              <AppdashGrid
                appFilter={appFilter}
                setAppFilter={setAppFilter}
                pending={pendingApplications}
                active={activeAssignments.length}
                completed={completedAssignments.length}
                open={openJobs.length}
                openSub={t("apps.openSub")}
                rating={myRatingAvg}
                ratingCount={myReceivedReviews.length}
                moneyLabel={t("apps.moneyLabel")}
                moneyValue={formatMoney(totalIncome)}
                moneyCount={completedAssignments.length}
                cards={appdash.cards}
                editing={appdash.editing}
                onMove={appdash.moveCard}
                onToggle={appdash.toggleCard}
              />
            )}

            {loadingData ? (
              <p className="host-empty">{t("apps.loading")}</p>
            ) : (
              <>
                {applicationActionError ? <p className="form-error cleaner-page-error">{applicationActionError}</p> : null}

                {/* Pending applications */}
                {(appFilter === null || appFilter === "pending") && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">
                      {t("apps.pending.title")}
                      {pendingApplications > 0 && <span className="host-apps-subtitle-count">{pendingApplications}</span>}
                    </h2>
                    {pendingSelfApplications.length === 0 ? (
                      <div className="host-apps-empty">
                        <Send size={32} />
                        <p>{t("apps.pending.empty")}</p>
                        <span className="host-apps-empty-hint">{t("apps.pending.emptyHint")}</span>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {pendingSelfApplications.map((application) => {
                          const summary = application.job_summary;
                          return <li key={application.id} className="host-app-card">
                            <div className="host-app-card-left">
                              <div className="host-app-job-info">
                                <strong className="host-app-job-title">{t("apps.openJobs.jobFallback")}</strong>
                                <span className="host-app-job-meta">{jobPlace(summary)}</span>
                                <span className="host-app-job-time">
                                  {fmtDateTime(summary?.scheduled_start)}
                                  {summary?.scheduled_end ? ` – ${fmtTime(summary.scheduled_end)}` : ""}
                                </span>
                              </div>
                            </div>
                            <div className="host-app-card-right">
                              {(application.proposed_price || summary?.proposed_price) && (
                                <span className="host-app-price">{money(application.proposed_price || summary?.proposed_price, summary?.currency || "EUR")}</span>
                              )}
                              <div className="host-app-actions">
                                <span className="host-app-badge host-app-badge--assigned">{t("apps.pending.awaitingHost")}</span>
                                <button
                                  className="host-app-reject-btn"
                                  type="button"
                                  disabled={cancelingApplicationId === application.id}
                                  onClick={() => void cancelApplication(application.id)}
                                >
                                  <X size={13} aria-hidden />
                                  {cancelingApplicationId === application.id ? "..." : t("apps.pending.withdraw")}
                                </button>
                              </div>
                            </div>
                          </li>;
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Active assignments */}
                {(appFilter === null || appFilter === "active") && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">{t("apps.active.title")}</h2>
                    {activeAssignments.length === 0 ? (
                      <div className="host-apps-empty">
                        <ClipboardList size={32} />
                        <p>{t("apps.active.empty")}</p>
                        <span className="host-apps-empty-hint">{t("apps.active.emptyHint")}</span>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {activeAssignments.map((assignment) => {
                          const job = jobById.get(assignment.job);
                          const jobStatus = job?.status || "assigned";
                          const cleanerDone = Boolean(assignment.cleaner_completed_at);
                          const hostDone = Boolean(assignment.host_completed_at);
                          const canMarkComplete = !cleanerDone && isPastDateTime(job?.scheduled_start, now);
                          const statusText = cleanerDone && !hostDone
                            ? t("apps.active.waitingHost")
                            : hostDone && !cleanerDone
                              ? t("apps.active.hostConfirmed")
                              : STATUS_LABEL[jobStatus];
                          return (
                            <li id={`assignment-${assignment.job}`} key={assignment.id} className="host-app-card host-app-card--assigned">
                              <div className="host-app-card-left">
                                <div className="host-app-job-info">
                                  <strong className="host-app-job-title">{t("apps.openJobs.jobFallback")}</strong>
                                  <span className="host-app-job-meta">{jobPlace(job)}</span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(job?.scheduled_start)} – {fmtTime(job?.scheduled_end)}
                                  </span>
                                </div>
                              </div>
                              <div className="host-app-card-right">
                                {(assignment.agreed_price || job?.agreed_price || job?.proposed_price) && (
                                  <span className="host-app-price">{money(assignment.agreed_price || job?.agreed_price || job?.proposed_price, job?.currency)}</span>
                                )}
                                <span className="host-app-badge host-app-badge--assigned">{statusText}</span>
                                {canMarkComplete && (
                                  <button
                                    className="host-app-complete-btn"
                                    type="button"
                                    disabled={completingJobId === assignment.job}
                                    onClick={() => void completeJob(assignment.job)}
                                  >
                                    {completingJobId === assignment.job ? "..." : t("apps.active.markDone")}
                                  </button>
                                )}
                                {assignment.available_actions?.includes("cancel") ? (
                                  <button
                                    className="host-delete-confirm-yes"
                                    type="button"
                                    onClick={() => {
                                      if (shouldSuppressModalOpen()) return;
                                      setCancelJobTarget({
                                        id: assignment.job,
                                        title: t("apps.openJobs.jobFallback"),
                                      });
                                    }}
                                  >
                                    {t("apps.active.cancelJob")}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Completed */}
                {(appFilter === "completed" || (appFilter === null && completedAssignments.length > 0)) && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle host-apps-subtitle--muted">{t("apps.completed.title")}</h2>
                    {completedAssignments.length === 0 ? (
                      <div className="host-apps-empty">
                        <CheckCircle2 size={32} />
                        <p>{t("apps.completed.empty")}</p>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {completedAssignments.map((assignment) => {
                          const job = jobById.get(assignment.job);
                          const hostId = job?.host;
                          const existingHostReview = hostId
                            ? reviews.find((review) => review.job === assignment.job && review.reviewee === hostId)
                            : undefined;
                          return (
                            <li id={`assignment-${assignment.job}`} key={assignment.id} className="host-app-card host-app-card--done">
                              <div className="host-app-card-left">
                                <div className="host-app-job-info">
                                  <strong className="host-app-job-title">{t("apps.openJobs.jobFallback")}</strong>
                                  <span className="host-app-job-meta">{jobPlace(job)}</span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(job?.scheduled_start)} – {fmtTime(job?.scheduled_end)}
                                  </span>
                                </div>
                              </div>
                              <div className="host-app-card-right">
                                {(assignment.agreed_price || job?.agreed_price) && (
                                  <span className="host-app-price">{money(assignment.agreed_price || job?.agreed_price, job?.currency)}</span>
                                )}
                                <span className="host-app-badge host-app-badge--done">{t("apps.completed.badge")}</span>
                              </div>
                              {hostId ? (
                                <div className="host-app-review-row">
                                  <button
                                    className="host-review-trigger"
                                    type="button"
                                    onClick={() => openReview(assignment, hostId)}
                                  >
                                    ★ {existingHostReview ? t("apps.completed.viewReview") : t("apps.completed.leaveReview")}
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Open jobs to apply to */}
                {(appFilter === null || appFilter === "open") && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">
                      {t("apps.openJobs.title")}
                      {openJobs.length > 0 && <span className="host-apps-subtitle-count">{openJobs.length}</span>}
                    </h2>

                    {availableJobCities.length > 1 && (
                      <div className="cleaner-location-filter">
                        <span className="cleaner-location-filter-label">{t("apps.openJobs.filterLabel")}</span>
                        <div className="cleaner-filter-chips">
                          <button
                            type="button"
                            className={`cleaner-filter-chip${!jobCityFilter ? " active" : ""}`}
                            onClick={() => setJobCityFilter("")}
                          >
                            {t("apps.openJobs.filterAll")}
                          </button>
                          {availableJobCities.map((city) => (
                            <button
                              key={city}
                              type="button"
                              className={`cleaner-filter-chip${jobCityFilter === city ? " active" : ""}`}
                              onClick={() => setJobCityFilter(jobCityFilter === city ? "" : city)}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {openJobs.length === 0 ? (
                      <div className="host-apps-empty">
                        <Briefcase size={32} />
                        <p>{jobCityFilter ? t("apps.openJobs.emptyFiltered", { city: jobCityFilter }) : t("apps.openJobs.empty")}</p>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {openJobs.map((job) => {
                          const application = applicationsByJob.get(job.id);
                          const disabledReason = !me.is_approved
                            ? t("apps.openJobs.approvalRequired")
                            : !profile?.is_verified
                              ? t("apps.openJobs.verificationRequired")
                              : "";
                          return (
                            <li key={job.id} className="host-app-card">
                              <div className="host-app-card-left">
                                <div className="host-app-job-info">
                                  <strong className="host-app-job-title">{t("apps.openJobs.jobFallback")}</strong>
                                  <span className="host-app-job-meta">{jobPlace(job)}</span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(job.scheduled_start)} – {fmtTime(job.scheduled_end)}
                                  </span>
                                  {(job.bedrooms != null || job.square_metres) ? (
                                    <span className="host-app-job-meta">
                                      {[
                                        job.bedrooms != null ? t("apps.openJobs.bedrooms", { count: job.bedrooms }) : "",
                                        job.square_metres ? t("apps.openJobs.squareMetres", { value: job.square_metres }) : "",
                                      ].filter(Boolean).join(" · ")}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="host-app-card-right">
                                {job.proposed_price && <span className="host-app-price">{money(job.proposed_price, job.currency)}</span>}
                                <div className="host-app-actions">
                                  {application ? (
                                    <span className={`cleaner-application-chip cleaner-application-${application.status}`}>
                                      {APPLICATION_LABEL[application.status]}
                                    </span>
                                  ) : (
                                    <button
                                      className="host-app-accept-btn"
                                      type="button"
                                      disabled={!canApply || job.can_apply === false}
                                      title={disabledReason}
                                      onClick={() => openApply(job)}
                                    >
                                      <Send size={13} aria-hidden />
                                      {t("apps.openJobs.apply")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* My rating */}
                {appFilter === "rating" && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">{t("apps.rating.title")}</h2>
                    <div className="host-rating-display">
                      <RatingStars rating={myRatingAvg ?? 0} count={myReceivedReviews.length} size={16} />
                    </div>
                    {myReceivedReviews.length === 0 ? (
                      <div className="host-apps-empty">
                        <Star size={32} />
                        <p>{t("apps.rating.empty")}</p>
                        <span className="host-apps-empty-hint">{t("apps.rating.emptyHint")}</span>
                      </div>
                    ) : (
                      <ul className="review-list">
                        {myReceivedReviews.map((review) => (
                          <li key={review.id} className="review-item">
                            <div className="review-item-head">
                              <strong>{review.reviewer_name}</strong>
                              <span className="host-review-given-stars">
                                {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                              </span>
                            </div>
                            {review.comment && <p>{review.comment}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {section === "offers" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("offers.eyebrow", { count: pendingOffers.length })}</p>
                <h1 className="host-section-title">{t("offers.title")}</h1>
              </div>
            </div>

            {loadingData ? (
              <p className="host-empty">{t("offers.loading")}</p>
            ) : pendingOffers.length === 0 ? (
              <div className="host-empty-state">
                <Gift size={40} />
                <p>{t("offers.empty")}</p>
              </div>
            ) : (
              <>
                {applicationActionError ? <p className="form-error">{applicationActionError}</p> : null}
                <ul className="cleaner-job-list">
                  {pendingOffers.map((offer) => {
                    const summary = offer.job_summary;
                    return (
                      <li key={offer.id} className="cleaner-job-card cleaner-offer-card">
                        <div className="cleaner-job-main">
                          <div>
                            <span className="cleaner-offer-badge"><Gift size={12} aria-hidden /> {t("offers.badge")}</span>
                            <strong>{t("apps.openJobs.jobFallback")}</strong>
                            <span>{jobPlace(summary)}</span>
                          </div>
                          <div className="cleaner-job-meta">
                            <span><CalendarDays size={14} aria-hidden />{fmtDateTime(summary?.scheduled_start)}</span>
                            <span>{money(offer.proposed_price || summary?.proposed_price, summary?.currency)}</span>
                          </div>
                        </div>
                        <div className="cleaner-job-actions">
                          <button
                            className="cleaner-action-primary"
                            type="button"
                            disabled={offerActionId === offer.id}
                            onClick={() => void acceptOffer(offer.id)}
                          >
                            <Check size={14} aria-hidden />
                            {offerActionId === offer.id ? t("offers.working") : t("offers.accept")}
                          </button>
                          <button
                            className="cleaner-action-primary cleaner-action-cancel"
                            type="button"
                            disabled={offerActionId === offer.id}
                            onClick={() => void declineOffer(offer.id)}
                          >
                            <X size={14} aria-hidden /> {t("offers.decline")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {section === "profile" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <h1 className="host-section-title">{t("profile.title")}</h1>
              </div>
            </div>

            {!profile ? (
              <div className="host-empty-state">
                <UserRoundCheck size={40} />
                <p>{t("profile.notFound")}</p>
              </div>
            ) : (
              <div className="cleaner-profile-layout">
                <div className="cleaner-profile-forms">
                  {profileError ? <p className="form-error cleaner-profile-feedback">{profileError}</p> : null}

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-account-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-account-title">{t("profile.accountSection")}</h2>
                      </div>
                      <div className="cleaner-profile-account-row">
                        <label className="cleaner-avatar-uploader">
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onProfileImageChange} />
                          <span className="cleaner-avatar-label">{t("profile.profileImageLabel")}</span>
                          <span className="cleaner-avatar-frame">
                            <Image
                              src={profileImage || DEFAULT_PROFILE_IMAGE}
                              alt="Profile"
                              fill
                              sizes="152px"
                              unoptimized
                              style={{ objectFit: "cover", objectPosition: "center" }}
                            />
                            <span className="cleaner-avatar-overlay">
                              <Plus size={18} aria-hidden />
                            </span>
                          </span>
                          {profileFieldErrors.profile_image ? <small className="field-error-text">{profileFieldErrors.profile_image}</small> : null}
                        </label>
                        <div className="form-grid">
                          <label>
                            <span>{t("profile.firstName")}</span>
                            <input
                              aria-invalid={Boolean(profileFieldErrors.first_name)}
                              className={profileFieldErrors.first_name ? "input-invalid" : ""}
                              value={profileFirstName}
                              onChange={(event) => {
                                setProfileFirstName(event.target.value);
                                clearProfileFieldError("first_name");
                              }}
                            />
                            {profileFieldErrors.first_name ? <small className="field-error-text">{profileFieldErrors.first_name}</small> : null}
                          </label>
                          <label>
                            <span>{t("profile.lastName")}</span>
                            <input
                              aria-invalid={Boolean(profileFieldErrors.last_name)}
                              className={profileFieldErrors.last_name ? "input-invalid" : ""}
                              value={profileLastName}
                              onChange={(event) => {
                                setProfileLastName(event.target.value);
                                clearProfileFieldError("last_name");
                              }}
                            />
                            {profileFieldErrors.last_name ? <small className="field-error-text">{profileFieldErrors.last_name}</small> : null}
                          </label>
                          <label className="cleaner-account-email-field">
                            <span>{t("profile.email")}</span>
                            <input value={me.email} readOnly />
                          </label>
                          <label className="cleaner-sex-picker">
                            <span>{t("profile.sex")}</span>
                            <select
                              aria-invalid={Boolean(profileFieldErrors.sex)}
                              className={profileFieldErrors.sex ? "input-invalid" : ""}
                              value={profileSex}
                              onChange={(event) => {
                                setProfileSex(event.target.value as CleanerSex);
                                clearProfileFieldError("sex");
                              }}
                            >
                              {sexOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                            {profileFieldErrors.sex ? <small className="field-error-text">{profileFieldErrors.sex}</small> : null}
                          </label>
                          <label>
                            <span>{t("profile.dateOfBirth")}</span>
                            <div className={profileFieldErrors.birth_date ? "birthdate-picker input-invalid" : "birthdate-picker"}>
                              <div className="birthdate-input-row">
                                <input
                                  type="date"
                                  value={profileBirthDate}
                                  min={minBirthDate}
                                  max={maxBirthDate}
                                  onChange={(event) => changeProfileBirthDate(event.target.value)}
                                aria-label={t("profile.dateOfBirth")}
                                  className="birthdate-input"
                                />
                                <button
                                  type="button"
                                  className="birthdate-toggle"
                                  onClick={() => setProfileBirthCalendarOpen((open) => !open)}
                                  aria-label={t("profile.chooseBirthDate")}
                                  aria-expanded={profileBirthCalendarOpen}
                                >
                                  <CalendarDays size={18} aria-hidden />
                                </button>
                              </div>
                              {profileBirthCalendarOpen ? (
                                <div className="birthdate-calendar">
                                  <div className="birthdate-calendar-head">
                                    <div className="birthdate-month-selectors">
                                      <select
                                        value={profileBirthCalendarMonth}
                                        onChange={(event) => setProfileBirthCalendarPosition(profileBirthCalendarYear, Number(event.target.value))}
                                        aria-label={t("profile.birthMonth")}
                                      >
                                        {BIRTHDATE_MONTH_NAMES.map((month, index) => (
                                          <option
                                            key={month}
                                            value={index}
                                            disabled={profileBirthCalendarYear === cutoffYear && index > cutoffMonth}
                                          >
                                            {month}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={profileBirthCalendarYear}
                                        onChange={(event) => {
                                          const nextYear = Number(event.target.value);
                                          setProfileBirthCalendarPosition(nextYear, profileBirthCalendarMonth);
                                        }}
                                        aria-label={t("profile.birthYear")}
                                      >
                                        {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                                      </select>
                                    </div>
                                    <div className="birthdate-month-arrows">
                                      <button type="button" onClick={() => moveProfileBirthMonth(-1)} aria-label="Previous month"><ChevronLeft size={22} aria-hidden /></button>
                                      <button
                                        type="button"
                                        onClick={() => moveProfileBirthMonth(1)}
                                        aria-label="Next month"
                                        disabled={profileBirthCalendarYear === cutoffYear && profileBirthCalendarMonth >= cutoffMonth}
                                      >
                                        <ChevronRight size={22} aria-hidden />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="birthdate-weekdays">
                                    {BIRTHDATE_WEEKDAY_LABELS.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                                  </div>
                                  <div className="birthdate-days">
                                    {Array.from({ length: firstWeekday(profileBirthCalendarYear, profileBirthCalendarMonth) }, (_, index) => <span className="birthdate-empty-day" key={`empty-${index}`} />)}
                                    {Array.from({ length: daysInMonth(profileBirthCalendarYear, profileBirthCalendarMonth) }, (_, index) => {
                                      const day = index + 1;
                                      const value = dateValue(new Date(profileBirthCalendarYear, profileBirthCalendarMonth, day));
                                      return (
                                        <button
                                          type="button"
                                          key={value}
                                          className={profileBirthDate === value ? "birthdate-day selected" : "birthdate-day"}
                                          onClick={() => selectProfileBirthDay(day)}
                                          disabled={!isAdultBirthDate(value)}
                                        >
                                          {day}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {profileFieldErrors.birth_date ? <small className="field-error-text">{profileFieldErrors.birth_date}</small> : null}
                          </label>
                        </div>
                      </div>
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-location-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-location-title">{tPF("location")}</h2>
                      </div>
                      <label className="cleaner-district-city-picker">
                        <span>{tPF("city")}</span>
                        <select
                          aria-invalid={Boolean(profileFieldErrors.district_city)}
                          className={profileFieldErrors.district_city ? "input-invalid" : ""}
                          value={profileDistrictCity}
                          onChange={(event) => {
                            const nextCity = event.target.value;
                            setProfileDistrictCity(nextCity);
                            clearProfileFieldError("district_city");
                            setDistrictSelectedZoneIds([]);
                            setDistrictZones([]);
                            const normalizedAreas = normalizeServiceAreasByCity(profileServiceAreas, nextCity);
                            setProfileServiceAreas(normalizedAreas.join("\n"));
                          }}
                        >
                          <option value="">{tPF("chooseCity")}</option>
                          {cities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                        {profileFieldErrors.district_city ? <small className="field-error-text">{profileFieldErrors.district_city}</small> : null}
                      </label>
                      <div className="cleaner-service-areas-section">
                        <div className="cleaner-service-areas-header">
                          <span>{tPF("serviceAreas")}</span>
                          <button
                            type="button"
                            className="secondary-link cleaner-add-districts-button"
                            onClick={openDistrictOverlay}
                            disabled={!profileDistrictCity}
                          >
                            {tPF("addDistricts")}
                          </button>
                        </div>
                        {normalizedServiceAreasForSave.length > 0 ? (
                          <div className="cleaner-service-area-tags">
                            {normalizedServiceAreasForSave.map((area) => (
                              <span key={area} className="cleaner-service-area-tag">{area}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="host-form-hint">{tPF("noServiceAreas")}</p>
                        )}
                        {profileFieldErrors.service_areas ? <small className="field-error-text">{profileFieldErrors.service_areas}</small> : null}
                      </div>
                      <p className="host-form-hint">{tPF("locationHint")}</p>
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-experience-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-experience-title">{tPF("experience")}</h2>
                      </div>
                      <div className="form-grid">
                        <label>
                          <span>{tPF("nativeLanguage")}</span>
                          <select
                            aria-invalid={Boolean(profileFieldErrors.native_language)}
                            className={profileFieldErrors.native_language ? "input-invalid" : ""}
                            value={profileNativeLanguage}
                            onChange={(event) => {
                              setProfileNativeLanguage(event.target.value);
                              clearProfileFieldError("native_language");
                            }}
                          >
                            {nativeLanguageOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {profileFieldErrors.native_language ? <small className="field-error-text">{profileFieldErrors.native_language}</small> : null}
                        </label>
                        <label>
                          <span>{tPF("education")}</span>
                          <select
                            aria-invalid={Boolean(profileFieldErrors.education)}
                            className={profileFieldErrors.education ? "input-invalid" : ""}
                            value={profileEducation}
                            onChange={(event) => {
                              setProfileEducation(event.target.value);
                              clearProfileFieldError("education");
                            }}
                          >
                            {educationOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {profileFieldErrors.education ? <small className="field-error-text">{profileFieldErrors.education}</small> : null}
                        </label>
                        <label>
                          <span>{tPF("cleaningExperience")}</span>
                          <select
                            aria-invalid={Boolean(profileFieldErrors.experience_level)}
                            className={profileFieldErrors.experience_level ? "input-invalid" : ""}
                            value={profileExperienceLevel}
                            onChange={(event) => {
                              setProfileExperienceLevel(event.target.value);
                              clearProfileFieldError("experience_level");
                            }}
                          >
                            {experienceOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {profileFieldErrors.experience_level ? <small className="field-error-text">{profileFieldErrors.experience_level}</small> : null}
                        </label>
                        <label>
                          <span>{tPF("drivingLicense")}</span>
                          <select
                            aria-invalid={Boolean(profileFieldErrors.has_driving_license)}
                            className={profileFieldErrors.has_driving_license ? "input-invalid" : ""}
                            value={profileHasDrivingLicense}
                            onChange={(event) => {
                              setProfileHasDrivingLicense(event.target.value as "" | "yes" | "no");
                              clearProfileFieldError("has_driving_license");
                            }}
                          >
                            {profileHasDrivingLicense === "" ? <option value="">{tPF("select")}</option> : null}
                            <option value="yes">{tPF("drivingYes")}</option>
                            <option value="no">{tPF("drivingNo")}</option>
                          </select>
                          {profileFieldErrors.has_driving_license ? <small className="field-error-text">{profileFieldErrors.has_driving_license}</small> : null}
                        </label>
                        {profileHasDrivingLicense === "yes" ? (
                          <label>
                            <span>{tPF("personalCar")}</span>
                            <select
                              aria-invalid={Boolean(profileFieldErrors.has_own_car)}
                              className={profileFieldErrors.has_own_car ? "input-invalid" : ""}
                              value={profileHasOwnCar}
                              onChange={(event) => {
                                setProfileHasOwnCar(event.target.value as "" | "yes" | "no");
                                clearProfileFieldError("has_own_car");
                              }}
                            >
                              {profileHasOwnCar === "" ? <option value="">{tPF("select")}</option> : null}
                              <option value="yes">{tPF("carYes")}</option>
                              <option value="no">{tPF("carNo")}</option>
                            </select>
                            {profileFieldErrors.has_own_car ? <small className="field-error-text">{profileFieldErrors.has_own_car}</small> : null}
                          </label>
                        ) : null}
                      </div>
                      <div className="cleaner-other-languages-section">
                        <div className="cleaner-other-languages-header">
                          <span>{tPF("otherLanguages")}</span>
                          <button type="button" className="secondary-link cleaner-other-languages-button" onClick={openOtherLanguagesOverlay}>
                            {tPF("selectLanguages")}
                          </button>
                        </div>
                        {profileOtherLanguages.length > 0 ? (
                          <div className="cleaner-other-language-tags">
                            {profileOtherLanguages.map((language) => (
                              <span key={language} className="cleaner-other-language-tag">{language}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="host-form-hint">{tPF("noOtherLanguages")}</p>
                        )}
                        {profileFieldErrors.other_languages ? <small className="field-error-text">{profileFieldErrors.other_languages}</small> : null}
                      </div>
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-extra-services-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-extra-services-title">{tPF("extraServices")}</h2>
                      </div>
                      <div className="cleaner-preferences-grid" role="group" aria-label={tPF("extraServices")}>
                        {personalPreferenceOptions.map((option) => {
                          const selected = profilePersonalPreferences.includes(option.value);
                          return (
                            <label key={option.value} className="cleaner-switch-option">
                              <span>{option.label}</span>
                              <button
                                type="button"
                                className={selected ? "cleaner-switch-toggle selected" : "cleaner-switch-toggle"}
                                role="switch"
                                aria-checked={selected}
                                aria-label={option.label}
                                onClick={() => {
                                  togglePersonalPreference(option.value);
                                  clearProfileFieldError("personal_preferences");
                                }}
                              >
                                <span className="cleaner-switch-toggle-thumb" aria-hidden />
                              </button>
                            </label>
                          );
                        })}
                      </div>
                      {profileFieldErrors.personal_preferences ? <small className="field-error-text">{profileFieldErrors.personal_preferences}</small> : null}
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-introduction-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-introduction-title">{tPF("introduction")}</h2>
                      </div>
                      <label>
                        <span>{tPF("introductionLabel")}</span>
                        <textarea
                          aria-invalid={Boolean(profileFieldErrors.bio)}
                          className={profileFieldErrors.bio ? "input-invalid" : ""}
                          rows={5}
                          maxLength={1500}
                          value={profileBio}
                          onChange={(event) => {
                            setProfileBio(event.target.value);
                            clearProfileFieldError("bio");
                          }}
                          placeholder={tPF("bioPlaceholder")}
                        />
                        {profileFieldErrors.bio ? <small className="field-error-text">{profileFieldErrors.bio}</small> : null}
                      </label>
                    </section>
                  </form>

                  <div className="host-form-actions cleaner-profile-save-actions">
                    {profileSaved ? <p className="cleaner-success cleaner-profile-save-status" aria-live="polite"><CheckCircle2 size={15} aria-hidden />{tPF("profileSaved")}</p> : null}
                    <button
                      className="primary-link auth-submit"
                      type="button"
                      disabled={savingProfile || !hasProfileChanges || !hasSelectedDistricts}
                      onClick={() => void submitAllProfileChanges()}
                    >
                      {savingProfile ? tPF("saving") : tPF("saveChanges")}
                    </button>
                  </div>
                  <AccountDeletionPanel email={me.email} />
                </div>

              </div>
            )}
          </div>
        )}
        </div>{/* host-workspace-main */}
        </div>{/* host-workspace */}
      </main>

      {districtOverlayOpen ? (
        <div className="host-modal-backdrop cleaner-district-backdrop" onClick={closeDistrictOverlay} role="dialog" aria-modal="true" aria-label={tPF("districtsModal.ariaLabel")}>
          <div className="host-modal host-modal--wide cleaner-district-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>{tPF("districtsModal.title")}</h2>
                <p className="host-modal-subtitle">
                  {selectedDistrictCity
                    ? tPF("districtsModal.subtitle", { city: selectedDistrictCity.label })
                    : tPF("districtsModal.chooseCity")}
                </p>
              </div>
              <button type="button" className="host-modal-close" onClick={closeDistrictOverlay} aria-label={tC("close")}>
                <X size={18} />
              </button>
            </div>
            <div className="host-form cleaner-district-overlay-form">
              {selectedDistrictCity ? (
                <section className="zones-panel" aria-label={tPF("districtsModal.zonesAriaLabel", { city: selectedDistrictCity.label })}>
                  <DistrictMapSelector
                    citySlug={selectedDistrictCity.value}
                    selectedZoneIds={districtSelectedZoneIds}
                    onChange={handleDistrictSelectorChange}
                    language="bg"
                    showListFallback={false}
                    onZonesLoaded={handleDistrictZonesLoaded}
                  />
                </section>
              ) : (
                <p className="host-form-hint">{tPF("districtsModal.chooseCity")}</p>
              )}

              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={closeDistrictOverlay}>
                  {tPF("districtsModal.cancel")}
                </button>
                <button
                  className="primary-link auth-submit"
                  type="button"
                  onClick={applyDistrictsToServiceAreas}
                  disabled={!selectedDistrictCity || districtSelectedZoneIds.length === 0}
                >
                  {tPF("districtsModal.addDistricts")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {otherLanguagesOverlayOpen ? (
        <div className="host-modal-backdrop" onClick={closeOtherLanguagesOverlay} role="dialog" aria-modal="true" aria-label={tPF("languagesModal.ariaLabel")}>
          <div className="host-modal cleaner-other-languages-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>{tPF("languagesModal.title")}</h2>
                <p className="host-modal-subtitle">{tPF("languagesModal.subtitle")}</p>
              </div>
              <button type="button" className="host-modal-close" onClick={closeOtherLanguagesOverlay} aria-label={tC("close")}>
                <X size={18} />
              </button>
            </div>
            <div className="host-form cleaner-other-languages-overlay-form">
              <div className="dual-zone-transfer">
                <label className="dual-zone-list">
                  <span>{tPF("languagesModal.available")}</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label={tPF("languagesModal.availableAriaLabel")}>
                    <div className="dual-zone-listbox-search-wrap">
                      <input
                        className="dual-zone-search"
                        type="text"
                        placeholder={tPF("languagesModal.search")}
                        value={otherLanguageSearch}
                        onChange={(event) => setOtherLanguageSearch(event.target.value)}
                      />
                    </div>
                    <div className="dual-zone-items">
                      {filteredAvailableOtherLanguageOptions.map((language) => (
                        <button
                          type="button"
                          key={language}
                          className="dual-zone-item"
                          onClick={() => addOtherLanguage(language)}
                        >
                          {language}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
                <label className="dual-zone-list">
                  <span>{tPF("languagesModal.selected")}</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label={tPF("languagesModal.selectedAriaLabel")}>
                    <div className="dual-zone-items">
                      {profileOtherLanguages.map((language) => (
                        <button
                          type="button"
                          key={language}
                          className="dual-zone-item selected"
                          onClick={() => removeOtherLanguage(language)}
                        >
                          {language}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
              </div>
              <p className="host-form-hint">{tPF("languagesModal.hint")}</p>
              <div className="host-form-actions cleaner-other-languages-actions">
                <button className="primary-link auth-submit" type="button" onClick={closeOtherLanguagesOverlay}>
                  {tPF("languagesModal.done")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cropSource && (
        <div
          className="host-modal-backdrop"
          onClick={closeCropEditor}
          role="dialog"
          aria-modal="true"
          aria-label={tPF("cropModal.ariaLabel")}
        >
          <div className="host-modal cleaner-crop-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{tPF("cropModal.title")}</h2>
              <button type="button" className="host-modal-close" onClick={closeCropEditor} aria-label={tC("close")}>
                <X size={18} />
              </button>
            </div>
            <div className="cleaner-crop-modal-body">
              <p className="cleaner-crop-hint">
                {tPF("cropModal.hint")}
              </p>
              <div className="cleaner-crop-canvas-wrap">
                <canvas
                  ref={cropCanvasRef}
                  className={cropDragging ? "cleaner-crop-canvas dragging" : "cleaner-crop-canvas"}
                  width={PROFILE_CROP_PREVIEW_SIZE}
                  height={PROFILE_CROP_PREVIEW_SIZE}
                  onPointerDown={onCropPointerDown}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerEnd}
                  onPointerCancel={onCropPointerEnd}
                  onPointerLeave={onCropPointerEnd}
                />
              </div>
              <div className="cleaner-crop-controls">
                <label className="cleaner-crop-zoom" htmlFor="profile-crop-zoom">
                  <span>{tPF("cropModal.zoom")}</span>
                  <input
                    id="profile-crop-zoom"
                    type="range"
                    min={PROFILE_CROP_MIN_ZOOM}
                    max={PROFILE_CROP_MAX_ZOOM}
                    step={0.01}
                    value={cropZoom}
                    onChange={(event) => setCropZoomLevel(Number(event.target.value))}
                  />
                  <strong>{cropZoom.toFixed(2)}x</strong>
                </label>
                <div className="cleaner-crop-actions cleaner-crop-actions--all">
                  <div className="cleaner-crop-actions-left">
                    <button type="button" className="secondary-link" onClick={resetCropPosition}>
                      {tPF("cropModal.center")}
                    </button>
                    <button
                      type="button"
                      className="secondary-link"
                      onClick={() => {
                        setCropZoomLevel(PROFILE_CROP_MIN_ZOOM);
                        resetCropPosition();
                      }}
                    >
                      {tPF("cropModal.reset")}
                    </button>
                  </div>
                  <div className="cleaner-crop-actions-right">
                    <button className="secondary-link" type="button" onClick={closeCropEditor}>
                      {tPF("cropModal.cancel")}
                    </button>
                    <button className="primary-link auth-submit" type="button" onClick={applyCropResult} disabled={cropBusy}>
                      {cropBusy ? tPF("cropModal.applying") : tPF("cropModal.useImage")}
                    </button>
                  </div>
                </div>
              </div>
              {cropError ? <p className="form-error">{cropError}</p> : null}
            </div>
          </div>
        </div>
      )}

      {applyJob && (
        <div
          className="host-modal-backdrop"
          onClick={() => setApplyJob(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("applyModal.ariaLabel")}
        >
          <div className="host-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{t("applyModal.title")}</h2>
              <button type="button" className="host-modal-close" onClick={() => setApplyJob(null)} aria-label={tC("close")}>
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(event) => void submitApplication(event)}>
              <div className="cleaner-apply-summary">
                <strong>{t("apps.openJobs.jobFallback")}</strong>
                <span>{jobPlace(applyJob)}</span>
                <span>{fmtDateTime(applyJob.scheduled_start)} - {fmtTime(applyJob.scheduled_end)}</span>
              </div>
              <label>
                <span>{t("applyModal.price")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={applyPrice}
                  onChange={(event) => setApplyPrice(event.target.value)}
                  placeholder="45.00"
                />
              </label>
              <label>
                <span>{t("applyModal.message")}</span>
                <textarea
                  rows={4}
                  value={applyMessage}
                  onChange={(event) => setApplyMessage(event.target.value)}
                  placeholder={t("applyModal.messagePlaceholder")}
                />
              </label>
              {applyError && <p className="form-error">{applyError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setApplyJob(null)}>
                  {t("applyModal.cancel")}
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={applying}>
                  {applying ? t("applyModal.sending") : t("applyModal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          jobId={reviewTarget.jobId}
          jobTitle={reviewTarget.jobTitle}
          revieweeId={reviewTarget.revieweeId}
          revieweeName={reviewTarget.revieweeName}
          meId={me.id}
          reviews={reviews}
          onClose={closeReviewModal}
          onSubmitted={() => void loadAll()}
        />
      )}

      {cancelJobTarget ? (
        <CancelJobDialog
          jobId={cancelJobTarget.id}
          jobTitle={cancelJobTarget.title}
          onClose={() => setCancelJobTarget(null)}
          onCancelled={() => void loadAll(true)}
        />
      ) : null}
    </>
  );
}

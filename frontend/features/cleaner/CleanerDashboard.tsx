"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
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
  LogOut,
  Plus,
  RefreshCcw,
  Send,
  Star,
  User,
  UserRoundCheck,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch, CurrentUser } from "../../lib/api";
import { money, formatMoney } from "../../lib/money";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import DistrictMapSelector from "../../app/components/DistrictMapSelector";
import NotificationBell from "../../components/NotificationBell";
import Connections from "../../components/Connections";
import StatusDonut from "../../components/StatusDonut";
import RatingStars from "../../components/RatingStars";
import { cities } from "../../lib/cityDistricts";
import { fallbackServiceZones, serviceAreaNamesToZoneIds, zoneIdsToServiceAreaNames } from "../../lib/locations";
import type { ServiceZone } from "../../types/locations";

type JobStatus = "draft" | "open" | "assigned" | "completed" | "cancelled" | "disputed";
type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";
type CleanerSex = "male" | "female" | "prefer_not_to_say";
type WeeklyTimeSlot = "morning" | "afternoon" | "evening";
type JobTypePreference = "one_off" | "ongoing" | "both";
type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type WeeklyAvailability = Partial<Record<Weekday, WeeklyTimeSlot[]>>;

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
  job_type_preference: JobTypePreference | "";
  preferred_time_slots: string[];
  weekly_availability: WeeklyAvailability;
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
  job_title?: string;
  job_scheduled_start?: string;
  job_scheduled_end?: string;
  job_status?: JobStatus;
  job_property_name?: string;
  job_property_city?: string;
  job_property_neighborhood?: string;
  agreed_price: string | null;
  assigned_at: string;
  host_completed_at: string | null;
  cleaner_completed_at: string | null;
  completed_at: string | null;
}

interface CleaningJob {
  id: number;
  property: number;
  property_name?: string;
  property_city?: string;
  property_neighborhood?: string;
  property_address?: string;
  host: number;
  host_name?: string;
  title: string;
  description: string;
  scheduled_start: string;
  scheduled_end: string;
  currency: string;
  proposed_price: string | null;
  agreed_price: string | null;
  status: JobStatus;
  cleaning_instructions: string;
  assignment?: AssignmentSummary | null;
}

type ApplicationOrigin = "cleaner_applied" | "host_offered";

interface CleanerApplication {
  id: number;
  job: number;
  job_title?: string;
  job_scheduled_start?: string;
  job_scheduled_end?: string;
  job_status?: JobStatus;
  job_property_name?: string;
  job_property_city?: string;
  job_property_neighborhood?: string;
  job_proposed_price?: string | null;
  status: ApplicationStatus;
  origin: ApplicationOrigin;
  proposed_price: string | null;
  message: string;
  created_at: string;
}

type CalendarItemType = "open_job" | "application" | "assignment" | "offer";
interface CalendarItem {
  id: string;
  item_type: CalendarItemType;
  job: number;
  application: number | null;
  assignment: number | null;
  title: string;
  starts_at: string;
  ends_at: string;
  currency: string;
  price: string | null;
  property_name: string;
  property_image?: string | null;
  property_city: string;
  host_name: string;
  job_status: JobStatus;
  application_status: ApplicationStatus | "";
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
  jobTypePreference: JobTypePreference | "";
  weeklyAvailability: string;
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
  | "job_type_preference"
  | "weekly_availability"
  | "profile_image"
  | "bio";

type ProfileFieldErrors = Partial<Record<ProfileFieldErrorKey, string>>;

type Section = "calendar" | "applications" | "offers" | "profile";
type CleanerAppFilter = "pending" | "active" | "completed" | "open" | "rating" | null;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BIRTHDATE_MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const BIRTHDATE_WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const sexOptions: Array<{ value: CleanerSex; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
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
const educationOptions = [
  { value: "none", label: "No education" },
  { value: "primary", label: "Primary education" },
  { value: "high_school", label: "High school" },
  { value: "higher", label: "Higher education" },
];
const experienceOptions = [
  { value: "none", label: "I don't have experience" },
  { value: "1_year", label: "1 year" },
  { value: "2_years", label: "2 years" },
  { value: "3_years", label: "3 years" },
  { value: "4_years", label: "4 years" },
  { value: "5_years", label: "5 years" },
  { value: "more_than_5_years", label: "More than 5 years of experience" },
];
const jobTypePreferenceOptions: Array<{ value: JobTypePreference | ""; label: string }> = [
  { value: "", label: "Not set" },
  { value: "one_off", label: "One-off jobs" },
  { value: "ongoing", label: "Ongoing work" },
  { value: "both", label: "Open to both" },
];
const weeklyDayOptions: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const weeklyTimeOptions: Array<{ value: WeeklyTimeSlot; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const otherLanguageCatalog = Array.from(
  new Set([...nativeLanguageOptions.map((option) => option.value), ...additionalLanguageOptions]),
).sort((a, b) => a.localeCompare(b, "bg"));
const personalPreferenceOptions = [
  { value: "provide_cleaning_supplies", label: "Provide cleaning supplies" },
  { value: "wash_and_dry_linen_towels", label: "Wash and dry linen and towels" },
  { value: "iron_and_fold_linen_towels", label: "Iron and fold linen and towels" },
  { value: "pet_friendly_homes", label: "Accept homes with pets" },
] as const;
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

const STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  assigned: "Assigned",
  completed: "Done",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const APPLICATION_LABEL: Record<ApplicationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const CALENDAR_LABEL: Record<CalendarItemType, string> = {
  open_job: "Open",
  application: "Applied",
  assignment: "Assigned",
  offer: "Offer",
};

function calendarItemColor(item: CalendarItem) {
  if (item.item_type === "offer") {
    return "var(--gold)";
  }
  if (item.item_type === "assignment") {
    return item.completed_at || item.job_status === "completed" ? "#22c55e" : "var(--gold)";
  }
  if (item.item_type === "application") {
    if (item.application_status === "accepted") return "var(--teal)";
    if (item.application_status === "rejected" || item.application_status === "withdrawn") return "var(--warning)";
    return "var(--gold)";
  }
  return "var(--teal)";
}

function normalizeWeeklyAvailability(value: unknown): WeeklyAvailability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const allowedSlots = new Set(weeklyTimeOptions.map((option) => option.value));
  const normalized: WeeklyAvailability = {};
  for (const day of weeklyDayOptions) {
    const slots = raw[day.value];
    if (!Array.isArray(slots)) continue;
    const validSlots = slots.filter((slot): slot is WeeklyTimeSlot => (
      typeof slot === "string" && allowedSlots.has(slot as WeeklyTimeSlot)
    ));
    if (validSlots.length > 0) normalized[day.value] = Array.from(new Set(validSlots));
  }
  return normalized;
}

function derivePreferredTimeSlots(value: WeeklyAvailability): WeeklyTimeSlot[] {
  const selected = new Set(Object.values(value).flatMap((slots) => slots ?? []));
  return weeklyTimeOptions.map((option) => option.value).filter((slot) => selected.has(slot));
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

function serializeWeeklyAvailability(value: WeeklyAvailability) {
  return weeklyDayOptions.map((day) => {
    const slots = value[day.value] ?? [];
    const normalizedSlots = weeklyTimeOptions
      .map((option) => option.value)
      .filter((slot) => slots.includes(slot));
    return `${day.value}:${normalizedSlots.join(",")}`;
  }).join("|");
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
  const allowed = new Set<string>(personalPreferenceOptions.map((option) => option.value));
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

function jobPlace(job?: Pick<CleaningJob, "property_name" | "property_city" | "property"> | null) {
  if (!job) return "Job details";
  const name = job.property_name || `Property #${job.property}`;
  return job.property_city ? `${name} - ${job.property_city}` : name;
}

export default function CleanerDashboard() {
  const searchParams = useSearchParams();
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
  const [jobCityFilter, setJobCityFilter] = useState<string>("");

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
  const [profileJobTypePreference, setProfileJobTypePreference] = useState<JobTypePreference | "">("");
  const [profileWeeklyAvailability, setProfileWeeklyAvailability] = useState<WeeklyAvailability>({});
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
  const [reviewJobId, setReviewJobId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hoveredReviewStar, setHoveredReviewStar] = useState(0);
  const [reviewError, setReviewError] = useState("");
  const [cancelingApplicationId, setCancelingApplicationId] = useState<number | null>(null);
  const [offerActionId, setOfferActionId] = useState<number | null>(null);
  const [applicationActionError, setApplicationActionError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const requestedSection = searchParams.get("section");
  const reviewJobParam = searchParams.get("reviewJob");
  const requestedReviewJobId = reviewJobParam ? Number(reviewJobParam) : null;

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
    } else if (requestedSection === "calendar" || requestedSection === "offers") {
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
    image.onerror = () => setCropError("Could not load image preview.");
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
          birth_date: "You must be at least 18 years old to work as a cleaner.",
        }));
      }
    }
  }

  function syncProfileForm(nextProfile: CleanerProfile, nextUserNames?: { first_name: string; last_name: string }) {
    const firstName = nextUserNames?.first_name ?? me?.first_name ?? "";
    const lastName = nextUserNames?.last_name ?? me?.last_name ?? "";
    const normalizedWeeklyAvailability = normalizeWeeklyAvailability(nextProfile.weekly_availability);
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
    setProfileJobTypePreference(nextProfile.job_type_preference || "");
    setProfileWeeklyAvailability(normalizedWeeklyAvailability);
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
      jobTypePreference: nextProfile.job_type_preference || "",
      weeklyAvailability: serializeWeeklyAvailability(normalizedWeeklyAvailability),
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
        setDataError("Could not load cleaner profile.");
      }

      if (jobsRes.ok) {
        setJobs(readList<CleaningJob>(await jobsRes.json()));
      } else if (!dataError) {
        setDataError("Could not load jobs.");
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
        setDataError("Network error. Check that the backend is running.");
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

  function openApply(job: CleaningJob) {
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
        setApplyError(messageFromResponse(await res.json(), "Could not submit application."));
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

  async function submitHostReview(assignment: AssignmentSummary, hostId?: number) {
    if (!hostId || reviewRating === 0) return;
    setSubmittingReview(true);
    setReviewError("");
    try {
      const res = await apiFetch("/api/feedback/reviews/", {
        method: "POST",
        body: JSON.stringify({
          job_id: assignment.job,
          reviewee_id: hostId,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewError(messageFromResponse(data, "Could not submit feedback."));
        return;
      }
      setReviews((prev) => [...prev, data as Review]);
      setReviewJobId(null);
      setReviewRating(0);
      setReviewComment("");
      setHoveredReviewStar(0);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function cancelApplication(applicationId: number) {
    setCancelingApplicationId(applicationId);
    setApplicationActionError("");
    try {
      const res = await apiFetch(`/api/marketplace/applications/${applicationId}/withdraw/`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApplicationActionError(messageFromResponse(data, "Could not cancel application."));
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
        setApplicationActionError(messageFromResponse(data, "Could not accept the offer."));
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
        setApplicationActionError(messageFromResponse(data, "Could not decline the offer."));
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
        setCropError("Could not prepare cropped image.");
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
      setCropError("Could not apply crop. Please try again.");
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
    if (!file.type.startsWith("image/")) {
      setProfileError("");
      setProfileFieldErrors((current) => ({ ...current, profile_image: "Please choose a valid image file." }));
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
            profile_image: "Could not open this image. Please choose another file.",
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
          job_type_preference: "job_type_preference",
          work_preference: "job_type_preference",
          preferred_time_slots: "weekly_availability",
          weekly_availability: "weekly_availability",
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
    if (!profileFirstName.trim()) nextFieldErrors.first_name = "First name is required.";
    if (!profileLastName.trim()) nextFieldErrors.last_name = "Last name is required.";
    if (!profileBirthDate) nextFieldErrors.birth_date = "Birth date is required.";
    else if (!isValidDateValue(profileBirthDate)) nextFieldErrors.birth_date = "Enter a valid birth date.";
    else if (!isAdultBirthDate(profileBirthDate)) nextFieldErrors.birth_date = "You must be at least 18 years old to work as a cleaner.";
    if (!profileDistrictCity) nextFieldErrors.district_city = "Choose a city before saving location details.";
    if (serviceAreas.length === 0) nextFieldErrors.service_areas = "Add at least one district from the selected city.";
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
          "Could not save name details.",
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
          job_type_preference: profileJobTypePreference,
          preferred_time_slots: derivePreferredTimeSlots(profileWeeklyAvailability),
          weekly_availability: profileWeeklyAvailability,
          profile_image: profileImage,
          bio: profileBio,
        },
        "Could not save profile changes.",
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

  function toggleProfileWeeklyAvailability(day: Weekday, slot: WeeklyTimeSlot) {
    setProfileWeeklyAvailability((current) => {
      const currentSlots = current[day] ?? [];
      const nextSlots = currentSlots.includes(slot)
        ? currentSlots.filter((item) => item !== slot)
        : [...currentSlots, slot];
      const next = { ...current };
      if (nextSlots.length > 0) next[day] = nextSlots;
      else delete next[day];
      return next;
    });
  }

  const selectedDistrictCity = useMemo(
    () => cities.find((item) => item.value === profileDistrictCity) ?? null,
    [profileDistrictCity],
  );

  function openDistrictOverlay() {
    if (!selectedDistrictCity) {
      setProfileError("");
      setProfileFieldErrors((current) => ({ ...current, district_city: "Choose a city first." }));
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

  const openJobs = useMemo(() => {
    let result = jobs.filter((job) => job.status === "open");
    if (jobCityFilter) {
      result = result.filter((job) => (job.property_city ?? "").toLowerCase() === jobCityFilter.toLowerCase());
    }
    return result.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  }, [jobs, jobCityFilter]);

  const availableJobCities = useMemo(() => {
    const cities = new Set<string>();
    jobs.filter((job) => job.status === "open").forEach((job) => {
      if (job.property_city) cities.add(job.property_city);
    });
    return Array.from(cities).sort();
  }, [jobs]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.completed_at),
    [assignments],
  );
  const completedAssignments = useMemo(
    () => assignments.filter((assignment) => Boolean(assignment.completed_at)),
    [assignments],
  );

  /** Total income = sum of agreed_price across fully-completed assignments. */
  const totalIncome = useMemo(
    () => completedAssignments.reduce((sum, a) => sum + Number(a.agreed_price ?? 0), 0),
    [completedAssignments],
  );

  useEffect(() => {
    if (!requestedReviewJobId || Number.isNaN(requestedReviewJobId)) return;
    const targetAssignment = assignments.find((assignment) => assignment.job === requestedReviewJobId);
    const targetJob = jobs.find((job) => job.id === requestedReviewJobId);
    if (!targetAssignment || !targetJob?.host) return;

    const jobStatus = targetJob.status || targetAssignment.job_status || "assigned";
    const isComplete = Boolean(targetAssignment.completed_at || jobStatus === "completed");
    const existingHostReview = reviews.find(
      (review) => review.job === requestedReviewJobId && review.reviewee === targetJob.host,
    );

    if (!isComplete || existingHostReview) return;

    setSection("applications");
    setAppFilter("completed");
    setReviewJobId(requestedReviewJobId);
    setReviewRating(0);
    setReviewComment("");
    setHoveredReviewStar(0);
    setReviewError("");
  }, [assignments, jobs, requestedReviewJobId, reviews]);

  useEffect(() => {
    if (!requestedReviewJobId || reviewJobId !== requestedReviewJobId) return;
    const card = document.getElementById(`assignment-${requestedReviewJobId}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [requestedReviewJobId, reviewJobId]);

  const blanks = firstWeekday(calYear, calMonth);
  const totalDays = daysInMonth(calYear, calMonth);
  const monthPrefix = `${calYear}-${pad(calMonth + 1)}-`;

  const calendarItemsByDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const item of calendarItems) {
      const ds = dateOnly(item.starts_at);
      if (ds.startsWith(monthPrefix)) {
        const day = parseInt(ds.slice(8), 10);
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(item);
      }
    }
    for (const dayItems of map.values()) {
      dayItems.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [calendarItems, monthPrefix]);

  const visibleCalendarItems = useMemo(() => {
    if (selectedDay !== null) {
      const target = `${monthPrefix}${pad(selectedDay)}`;
      return calendarItems.filter((item) => dateOnly(item.starts_at) === target);
    }
    return [...calendarItems].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [calendarItems, monthPrefix, selectedDay]);

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
  const selfApplications = applications.filter((application) => application.origin !== "host_offered");
  const pendingSelfApplications = selfApplications
    .filter((application) => application.status === "pending")
    .sort((a, b) => (a.job_scheduled_start ?? "").localeCompare(b.job_scheduled_start ?? ""));
  const pendingApplications = pendingSelfApplications.length;
  const myReceivedReviews = reviews.filter((review) => review.reviewee === (me?.id ?? -1));
  const myRatingAvg = myReceivedReviews.length > 0
    ? myReceivedReviews.reduce((sum, review) => sum + review.rating, 0) / myReceivedReviews.length
    : null;
  const fullName = `${me?.first_name || ""} ${me?.last_name || ""}`.trim();
  const displayName = fullName || me?.email.split("@")[0] || "Cleaner";
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
      jobTypePreference: profileJobTypePreference,
      weeklyAvailability: serializeWeeklyAvailability(profileWeeklyAvailability),
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
      profileJobTypePreference,
      profileWeeklyAvailability,
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
    return <main className="host-page cleaner-page"><p className="host-loading">Loading...</p></main>;
  }

  if (!me) {
    return (
      <main className="host-page cleaner-page">
        <section className="admin-gate">
          <p className="eyebrow">Protected area</p>
          <h1>Log in to continue</h1>
          <Link className="primary-link" href="/login">Go to login</Link>
        </section>
      </main>
    );
  }

  if (me.role !== "cleaner") {
    return (
      <main className="host-page cleaner-page">
        <section className="admin-gate">
          <p className="eyebrow">Cleaners only</p>
          <h1>Wrong dashboard</h1>
          <p>This dashboard is for individual cleaner accounts.</p>
          <Link className="secondary-link" href="/app">Go to your workspace</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="host-topbar cleaner-topbar">
        <Link className="site-brand" href="/">
          <span className="brand-symbol"><HomeIcon size={18} aria-hidden /></span>
          <strong>Host Cleaners</strong>
        </Link>

        <nav className="host-section-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={`host-tab${section === "calendar" ? " active" : ""}`}
            onClick={() => setSection("calendar")}
          >
            <CalendarDays size={15} aria-hidden />
            Jobs &amp; Calendar
            {calendarItems.length > 0 && <span className="host-tab-count">{calendarItems.length}</span>}
          </button>
          <button
            type="button"
            className={`host-tab${section === "applications" ? " active" : ""}`}
            onClick={() => setSection("applications")}
          >
            <ClipboardList size={15} aria-hidden />
            Applications
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
            Offers
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
              aria-label="Account menu"
            >
              <User size={18} aria-hidden />
            </button>
            {accountMenuOpen ? (
              <div className="cleaner-account-menu-dropdown" role="menu" aria-label="Account menu">
                <div className="cleaner-account-menu-identity">
                  <strong>{displayName}</strong>
                  <span>Cleaner</span>
                </div>
                <button type="button" className="cleaner-account-menu-item" role="menuitem" onClick={openProfileFromMenu}>
                  <UserRoundCheck size={16} aria-hidden />
                  Profile
                </button>
                <button type="button" className="cleaner-account-menu-item cleaner-account-menu-item--danger" role="menuitem" onClick={() => void logout()}>
                  <LogOut size={16} aria-hidden />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="host-page cleaner-page">
        {!me.is_approved && (
          <div className="host-pending-banner">
            Your account is <strong>{me.account_status}</strong>. You can complete your profile while marketplace access waits for admin approval.
          </div>
        )}
        {me.is_approved && profile && !profile.is_verified && (
          <div className="host-pending-banner cleaner-verification-banner">
            Your cleaner profile is <strong>{profile.verification_status}</strong>. Job applications unlock after admin verification.
          </div>
        )}
        {dataError && <p className="form-error cleaner-page-error">{dataError}</p>}

        {section === "calendar" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Cleaner schedule</p>
                <h1 className="host-section-title">Jobs &amp; Calendar</h1>
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
                {loadingData || loadingCalendar ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!me.is_approved ? (
              <div className="host-empty-state">
                <CalendarDays size={40} />
                <p>Calendar opens after your account is approved.</p>
              </div>
            ) : (
              <div className="host-jobs-layout cleaner-calendar-layout">
                <div className="host-calendar">
                  <div className="host-cal-nav">
                    <button type="button" className="host-cal-arrow" onClick={prevMonth} aria-label="Previous month">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="host-cal-title">{MONTHS[calMonth]} {calYear}</span>
                    <button type="button" className="host-cal-arrow" onClick={nextMonth} aria-label="Next month">
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
                          title={dayItems.length > 0 ? `${dayItems.length} calendar item(s)` : "No items"}
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
                                    <Building2 size={11} aria-hidden />
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
                        Show all
                      </button>
                    )}
                  </div>

                  {loadingCalendar ? (
                    <p className="host-empty cleaner-calendar-loading">Loading calendar...</p>
                  ) : visibleCalendarItems.length === 0 ? (
                    <div className="host-job-empty">
                      <p>No calendar items {selectedDay ? "on this day" : "this month"}.</p>
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
                              <strong>{item.title}</strong>
                              <span className="host-job-property">
                                {item.property_name}{item.property_city ? ` - ${item.property_city}` : ""}
                              </span>
                              <span className="host-job-time">
                                {fmtDateTime(item.starts_at)} - {fmtTime(item.ends_at)}
                              </span>
                            </div>
                            <div className="host-job-right">
                              <span
                                className={`cleaner-application-chip cleaner-calendar-chip cleaner-calendar-${item.item_type}${item.item_type === "application" && item.application_status ? ` cleaner-calendar-application-${item.application_status}` : ""}`}
                              >
                                {item.item_type === "application" && item.application_status
                                  ? APPLICATION_LABEL[item.application_status]
                                  : item.item_type === "assignment" && (item.completed_at || item.job_status === "completed")
                                    ? "Completed"
                                    : CALENDAR_LABEL[item.item_type]}
                              </span>
                              {item.price && <span className="host-job-price">{money(item.price, item.currency)}</span>}
                              {itemCanApply && linkedJob && (
                                <button
                                  className="host-publish-btn"
                                  type="button"
                                  onClick={() => openApply(linkedJob)}
                                >
                                  Apply
                                </button>
                              )}
                              {item.can_complete && isPastDateTime(item.starts_at, now) && (
                                <button
                                  className="host-publish-btn cleaner-calendar-done"
                                  type="button"
                                  disabled={completingJobId === item.job}
                                  onClick={() => void completeJob(item.job)}
                                >
                                  {completingJobId === item.job ? "Saving..." : "Mark done"}
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
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Your work</p>
                <h1 className="host-section-title">Applications</h1>
              </div>
              <button
                className="secondary-link admin-refresh-button"
                type="button"
                onClick={() => void loadAll()}
                disabled={loadingData}
              >
                <RefreshCcw size={15} aria-hidden />
                {loadingData ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!loadingData && (
              <div className="host-appdash-grid host-appdash-grid--donut">
                {(() => {
                  const pending = pendingApplications;
                  const active = activeAssignments.length;
                  const completed = completedAssignments.length;
                  const open = openJobs.length;
                  const total = pending + active + completed + open;
                  const segs = [
                    { key: "pending" as const, label: "Pending", color: "var(--brand)", value: pending },
                    { key: "active" as const, label: "Active", color: "var(--gold)", value: active },
                    { key: "completed" as const, label: "Completed", color: "#22c55e", value: completed },
                    { key: "open" as const, label: "Open", color: "var(--teal)", value: open },
                  ];
                  return (
                    <div
                      className="host-appdash-card host-appdash-card--hero host-appdash-hero-donut"
                      role="button"
                      tabIndex={0}
                      title="Show everything"
                      onClick={() => setAppFilter(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setAppFilter(null);
                        }
                      }}
                    >
                      <StatusDonut
                        segments={segs.map((s) => ({ value: s.value, color: s.color }))}
                        centerTop={total}
                        centerBottom="in pipeline"
                      />
                      <div className="host-appdash-legend">
                        <span className="host-appdash-legend-title">Job pipeline</span>
                        {segs.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`host-appdash-legend-row${appFilter === item.key ? " active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAppFilter(appFilter === item.key ? null : item.key);
                            }}
                          >
                            <span className="host-appdash-legend-dot" style={{ background: item.color }} />
                            <span className="host-appdash-legend-label">{item.label}</span>
                            <span className="host-appdash-legend-count">{item.value}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <button
                  type="button"
                  className={`host-appdash-card host-appdash-card--gold${appFilter === "rating" ? " host-appdash-card--active" : ""}`}
                  onClick={() => setAppFilter(appFilter === "rating" ? null : "rating")}
                >
                  <span className="host-appdash-chip host-appdash-chip--gold"><Star size={17} aria-hidden /></span>
                  <span className="host-appdash-label">My rating</span>
                  <strong className="host-appdash-value host-appdash-value--rating">
                    {myRatingAvg !== null ? myRatingAvg.toFixed(1) : "—"}
                  </strong>
                  <span className="host-appdash-sub">
                    {myReceivedReviews.length > 0
                      ? `${myReceivedReviews.length} review${myReceivedReviews.length !== 1 ? "s" : ""} received`
                      : "no reviews yet"}
                  </span>
                </button>
                <div className="host-appdash-card host-appdash-card--money host-appdash-card--static">
                  <span className="host-appdash-chip host-appdash-chip--teal"><Wallet size={17} aria-hidden /></span>
                  <span className="host-appdash-label">Income</span>
                  <strong className="host-appdash-value host-appdash-value--money">
                    {formatMoney(totalIncome)}
                  </strong>
                  <span className="host-appdash-sub">
                    {completedAssignments.length > 0
                      ? `from ${completedAssignments.length} cleaning${completedAssignments.length !== 1 ? "s" : ""}`
                      : "no completed jobs yet"}
                  </span>
                </div>
              </div>
            )}

            {loadingData ? (
              <p className="host-empty">Loading...</p>
            ) : (
              <>
                {applicationActionError ? <p className="form-error cleaner-page-error">{applicationActionError}</p> : null}

                {/* Pending applications */}
                {(appFilter === null || appFilter === "pending") && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">
                      Pending applications
                      {pendingApplications > 0 && <span className="host-apps-subtitle-count">{pendingApplications}</span>}
                    </h2>
                    {pendingSelfApplications.length === 0 ? (
                      <div className="host-apps-empty">
                        <Send size={32} />
                        <p>No pending applications.</p>
                        <span className="host-apps-empty-hint">Apply to open jobs and they appear here until the host responds.</span>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {pendingSelfApplications.map((application) => (
                          <li key={application.id} className="host-app-card">
                            <div className="host-app-card-left">
                              <div className="host-app-job-info">
                                <strong className="host-app-job-title">{application.job_title || `Job #${application.job}`}</strong>
                                <span className="host-app-job-meta">
                                  {application.job_property_name}
                                  {application.job_property_city ? ` · ${application.job_property_city}` : ""}
                                </span>
                                <span className="host-app-job-time">
                                  {fmtDateTime(application.job_scheduled_start)}
                                  {application.job_scheduled_end ? ` – ${fmtTime(application.job_scheduled_end)}` : ""}
                                </span>
                              </div>
                              {application.message && <p className="host-app-message">&quot;{application.message}&quot;</p>}
                            </div>
                            <div className="host-app-card-right">
                              {(application.proposed_price || application.job_proposed_price) && (
                                <span className="host-app-price">{money(application.proposed_price || application.job_proposed_price, "EUR")}</span>
                              )}
                              <div className="host-app-actions">
                                <span className="host-app-badge host-app-badge--assigned">Awaiting host</span>
                                <button
                                  className="host-app-reject-btn"
                                  type="button"
                                  disabled={cancelingApplicationId === application.id}
                                  onClick={() => void cancelApplication(application.id)}
                                >
                                  <X size={13} aria-hidden />
                                  {cancelingApplicationId === application.id ? "..." : "Withdraw"}
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Active assignments */}
                {(appFilter === null || appFilter === "active") && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">Active assignments</h2>
                    {activeAssignments.length === 0 ? (
                      <div className="host-apps-empty">
                        <ClipboardList size={32} />
                        <p>No active assignments yet.</p>
                        <span className="host-apps-empty-hint">Accepted jobs appear here.</span>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {activeAssignments.map((assignment) => {
                          const job = jobById.get(assignment.job);
                          const jobStatus = job?.status || assignment.job_status || "assigned";
                          const cleanerDone = Boolean(assignment.cleaner_completed_at);
                          const hostDone = Boolean(assignment.host_completed_at);
                          const canMarkComplete = !cleanerDone && isPastDateTime(assignment.job_scheduled_start || job?.scheduled_start, now);
                          const statusText = cleanerDone && !hostDone
                            ? "Waiting for host"
                            : hostDone && !cleanerDone
                              ? "Host confirmed"
                              : STATUS_LABEL[jobStatus];
                          return (
                            <li id={`assignment-${assignment.job}`} key={assignment.id} className="host-app-card host-app-card--assigned">
                              <div className="host-app-card-left">
                                <div className="host-app-job-info">
                                  <strong className="host-app-job-title">{assignment.job_title || job?.title || `Job #${assignment.job}`}</strong>
                                  <span className="host-app-job-meta">{assignment.job_property_name || jobPlace(job)}</span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(assignment.job_scheduled_start || job?.scheduled_start)} – {fmtTime(assignment.job_scheduled_end || job?.scheduled_end)}
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
                                    {completingJobId === assignment.job ? "..." : "Mark done"}
                                  </button>
                                )}
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
                    <h2 className="host-apps-subtitle host-apps-subtitle--muted">Completed</h2>
                    {completedAssignments.length === 0 ? (
                      <div className="host-apps-empty">
                        <CheckCircle2 size={32} />
                        <p>No completed cleanings yet.</p>
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
                                  <strong className="host-app-job-title">{assignment.job_title || job?.title || `Job #${assignment.job}`}</strong>
                                  <span className="host-app-job-meta">{assignment.job_property_name || jobPlace(job)}</span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(assignment.job_scheduled_start || job?.scheduled_start)} – {fmtTime(assignment.job_scheduled_end || job?.scheduled_end)}
                                  </span>
                                </div>
                              </div>
                              <div className="host-app-card-right">
                                {(assignment.agreed_price || job?.agreed_price) && (
                                  <span className="host-app-price">{money(assignment.agreed_price || job?.agreed_price, job?.currency)}</span>
                                )}
                                <span className="host-app-badge host-app-badge--done">Done</span>
                              </div>
                              {hostId ? (
                                <div className="host-app-review-row">
                                  {existingHostReview ? (
                                    <div className="host-review-given">
                                      <span className="host-review-given-stars">
                                        {"★".repeat(existingHostReview.rating)}{"☆".repeat(5 - existingHostReview.rating)}
                                      </span>
                                      {existingHostReview.comment ? (
                                        <span className="host-review-given-comment">&quot;{existingHostReview.comment}&quot;</span>
                                      ) : null}
                                    </div>
                                  ) : reviewJobId === assignment.job ? (
                                    <div className="host-review-form">
                                      <div className="host-stars">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <button
                                            key={star}
                                            type="button"
                                            className={`host-star${(hoveredReviewStar || reviewRating) >= star ? " host-star--on" : ""}`}
                                            onMouseEnter={() => setHoveredReviewStar(star)}
                                            onMouseLeave={() => setHoveredReviewStar(0)}
                                            onClick={() => setReviewRating(star)}
                                            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                                          >★</button>
                                        ))}
                                      </div>
                                      <textarea
                                        className="host-review-textarea"
                                        placeholder="Leave feedback for the host..."
                                        rows={2}
                                        value={reviewComment}
                                        onChange={(event) => setReviewComment(event.target.value)}
                                      />
                                      {reviewError ? <p className="form-error cleaner-page-error">{reviewError}</p> : null}
                                      <div className="host-review-actions">
                                        <button
                                          className="host-review-cancel"
                                          type="button"
                                          onClick={() => {
                                            setReviewJobId(null);
                                            setReviewRating(0);
                                            setReviewComment("");
                                            setHoveredReviewStar(0);
                                            setReviewError("");
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          className="host-review-submit"
                                          type="button"
                                          disabled={reviewRating === 0 || submittingReview}
                                          onClick={() => void submitHostReview(assignment, hostId)}
                                        >
                                          {submittingReview ? "Saving..." : "Submit feedback"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      className="host-review-trigger"
                                      type="button"
                                      onClick={() => {
                                        setReviewJobId(assignment.job);
                                        setReviewRating(0);
                                        setReviewComment("");
                                        setHoveredReviewStar(0);
                                        setReviewError("");
                                      }}
                                    >
                                      ★ Leave host feedback
                                    </button>
                                  )}
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
                      Open jobs
                      {openJobs.length > 0 && <span className="host-apps-subtitle-count">{openJobs.length}</span>}
                    </h2>

                    {availableJobCities.length > 1 && (
                      <div className="cleaner-location-filter">
                        <span className="cleaner-location-filter-label">Filter by city:</span>
                        <div className="cleaner-filter-chips">
                          <button
                            type="button"
                            className={`cleaner-filter-chip${!jobCityFilter ? " active" : ""}`}
                            onClick={() => setJobCityFilter("")}
                          >
                            All
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
                        <p>{jobCityFilter ? `No open jobs in ${jobCityFilter} right now.` : "No open jobs are visible right now."}</p>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {openJobs.map((job) => {
                          const application = applicationsByJob.get(job.id);
                          const disabledReason = !me.is_approved
                            ? "Account approval required"
                            : !profile?.is_verified
                              ? "Profile verification required"
                              : "";
                          return (
                            <li key={job.id} className="host-app-card">
                              <div className="host-app-card-left">
                                <div className="host-app-job-info">
                                  <strong className="host-app-job-title">{job.title}</strong>
                                  <span className="host-app-job-meta">
                                    {job.property_city ?? ""}
                                    {job.property_neighborhood ? ` · ${job.property_neighborhood}` : ""}
                                    {job.property_name ? ` · ${job.property_name}` : ""}
                                  </span>
                                  <span className="host-app-job-time">
                                    {fmtDateTime(job.scheduled_start)} – {fmtTime(job.scheduled_end)}
                                  </span>
                                </div>
                                {(job.description || job.cleaning_instructions) && (
                                  <p className="host-app-message">{job.description || job.cleaning_instructions}</p>
                                )}
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
                                      disabled={!canApply}
                                      title={disabledReason}
                                      onClick={() => openApply(job)}
                                    >
                                      <Send size={13} aria-hidden />
                                      Apply
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
                    <h2 className="host-apps-subtitle">My rating</h2>
                    <div className="host-rating-display">
                      <RatingStars rating={myRatingAvg ?? 0} count={myReceivedReviews.length} size={16} />
                    </div>
                    {myReceivedReviews.length === 0 ? (
                      <div className="host-apps-empty">
                        <Star size={32} />
                        <p>No reviews yet.</p>
                        <span className="host-apps-empty-hint">Hosts can review you after a completed cleaning.</span>
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
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{pendingOffers.length} pending</p>
                <h1 className="host-section-title">Direct offers</h1>
              </div>
            </div>

            {loadingData ? (
              <p className="host-empty">Loading offers...</p>
            ) : pendingOffers.length === 0 ? (
              <div className="host-empty-state">
                <Gift size={40} />
                <p>When a host offers you a job directly, it appears here.</p>
              </div>
            ) : (
              <>
                {applicationActionError ? <p className="form-error">{applicationActionError}</p> : null}
                <ul className="cleaner-job-list">
                  {pendingOffers.map((offer) => {
                    const job = jobById.get(offer.job);
                    return (
                      <li key={offer.id} className="cleaner-job-card cleaner-offer-card">
                        <div className="cleaner-job-main">
                          <div>
                            <span className="cleaner-offer-badge"><Gift size={12} aria-hidden /> Offer</span>
                            <strong>{offer.job_title || job?.title || `Job #${offer.job}`}</strong>
                            <span>{offer.job_property_name || jobPlace(job)}</span>
                          </div>
                          <div className="cleaner-job-meta">
                            <span><CalendarDays size={14} aria-hidden />{fmtDateTime(offer.job_scheduled_start || job?.scheduled_start)}</span>
                            <span>{money(offer.proposed_price || offer.job_proposed_price, job?.currency)}</span>
                          </div>
                          {offer.message && <p>{offer.message}</p>}
                        </div>
                        <div className="cleaner-job-actions">
                          <button
                            className="cleaner-action-primary"
                            type="button"
                            disabled={offerActionId === offer.id}
                            onClick={() => void acceptOffer(offer.id)}
                          >
                            <Check size={14} aria-hidden />
                            {offerActionId === offer.id ? "Working..." : "Accept"}
                          </button>
                          <button
                            className="cleaner-action-primary cleaner-action-cancel"
                            type="button"
                            disabled={offerActionId === offer.id}
                            onClick={() => void declineOffer(offer.id)}
                          >
                            <X size={14} aria-hidden /> Decline
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
                <h1 className="host-section-title">Cleaner Profile</h1>
              </div>
            </div>

            {!profile ? (
              <div className="host-empty-state">
                <UserRoundCheck size={40} />
                <p>Cleaner profile was not found for this account.</p>
              </div>
            ) : (
              <div className="cleaner-profile-layout">
                <div className="cleaner-profile-forms">
                  {profileError ? <p className="form-error cleaner-profile-feedback">{profileError}</p> : null}

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-account-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-account-title">Account &amp; personal information</h2>
                      </div>
                      <div className="cleaner-profile-account-row">
                        <label className="cleaner-avatar-uploader">
                          <input type="file" accept="image/*" onChange={onProfileImageChange} />
                          <span className="cleaner-avatar-label">Profile image</span>
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
                            <span>First name</span>
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
                            <span>Last name</span>
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
                            <span>Email</span>
                            <input value={me.email} readOnly />
                          </label>
                          <label className="cleaner-sex-picker">
                            <span>Sex</span>
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
                            <span>Date of birth</span>
                            <div className={profileFieldErrors.birth_date ? "birthdate-picker input-invalid" : "birthdate-picker"}>
                              <div className="birthdate-input-row">
                                <input
                                  type="date"
                                  value={profileBirthDate}
                                  min={minBirthDate}
                                  max={maxBirthDate}
                                  onChange={(event) => changeProfileBirthDate(event.target.value)}
                                aria-label="Date of birth"
                                  className="birthdate-input"
                                />
                                <button
                                  type="button"
                                  className="birthdate-toggle"
                                  onClick={() => setProfileBirthCalendarOpen((open) => !open)}
                                  aria-label="Choose birth date from calendar"
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
                                        aria-label="Birth month"
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
                                        aria-label="Birth year"
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
                        <h2 id="cleaner-location-title">Location</h2>
                      </div>
                      <label className="cleaner-district-city-picker">
                        <span>City</span>
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
                          <option value="">Choose city</option>
                          {cities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                        {profileFieldErrors.district_city ? <small className="field-error-text">{profileFieldErrors.district_city}</small> : null}
                      </label>
                      <div className="cleaner-service-areas-section">
                        <div className="cleaner-service-areas-header">
                          <span>Service areas</span>
                          <button
                            type="button"
                            className="secondary-link cleaner-add-districts-button"
                            onClick={openDistrictOverlay}
                            disabled={!profileDistrictCity}
                          >
                            Add districts
                          </button>
                        </div>
                        {normalizedServiceAreasForSave.length > 0 ? (
                          <div className="cleaner-service-area-tags">
                            {normalizedServiceAreasForSave.map((area) => (
                              <span key={area} className="cleaner-service-area-tag">{area}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="host-form-hint">No service areas selected.</p>
                        )}
                        {profileFieldErrors.service_areas ? <small className="field-error-text">{profileFieldErrors.service_areas}</small> : null}
                      </div>
                      <p className="host-form-hint">Select a <strong>City</strong> and then use <strong>Add districts</strong> to manage service areas.</p>
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-experience-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-experience-title">Experience</h2>
                      </div>
                      <div className="form-grid">
                        <label>
                          <span>My Native language</span>
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
                          <span>Education</span>
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
                          <span>Cleaning experience</span>
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
                          <span>Driving license</span>
                          <select
                            aria-invalid={Boolean(profileFieldErrors.has_driving_license)}
                            className={profileFieldErrors.has_driving_license ? "input-invalid" : ""}
                            value={profileHasDrivingLicense}
                            onChange={(event) => {
                              setProfileHasDrivingLicense(event.target.value as "" | "yes" | "no");
                              clearProfileFieldError("has_driving_license");
                            }}
                          >
                            {profileHasDrivingLicense === "" ? <option value="">Select</option> : null}
                            <option value="yes">I have a driving license</option>
                            <option value="no">I don&apos;t have a driving license</option>
                          </select>
                          {profileFieldErrors.has_driving_license ? <small className="field-error-text">{profileFieldErrors.has_driving_license}</small> : null}
                        </label>
                        {profileHasDrivingLicense === "yes" ? (
                          <label>
                            <span>Personal car</span>
                            <select
                              aria-invalid={Boolean(profileFieldErrors.has_own_car)}
                              className={profileFieldErrors.has_own_car ? "input-invalid" : ""}
                              value={profileHasOwnCar}
                              onChange={(event) => {
                                setProfileHasOwnCar(event.target.value as "" | "yes" | "no");
                                clearProfileFieldError("has_own_car");
                              }}
                            >
                              {profileHasOwnCar === "" ? <option value="">Select</option> : null}
                              <option value="yes">I have a personal car</option>
                              <option value="no">I don&apos;t have a personal car</option>
                            </select>
                            {profileFieldErrors.has_own_car ? <small className="field-error-text">{profileFieldErrors.has_own_car}</small> : null}
                          </label>
                        ) : null}
                      </div>
                      <div className="cleaner-other-languages-section">
                        <div className="cleaner-other-languages-header">
                          <span>Other languages</span>
                          <button type="button" className="secondary-link cleaner-other-languages-button" onClick={openOtherLanguagesOverlay}>
                            Select languages
                          </button>
                        </div>
                        {profileOtherLanguages.length > 0 ? (
                          <div className="cleaner-other-language-tags">
                            {profileOtherLanguages.map((language) => (
                              <span key={language} className="cleaner-other-language-tag">{language}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="host-form-hint">No additional languages selected.</p>
                        )}
                        {profileFieldErrors.other_languages ? <small className="field-error-text">{profileFieldErrors.other_languages}</small> : null}
                      </div>
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-availability-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-availability-title">Availability</h2>
                      </div>
                      <section aria-labelledby="cleaner-job-type-preference-title">
                        <h3 id="cleaner-job-type-preference-title">Job preference</h3>
                        <div className="signup-availability-choice-grid signup-job-type-grid" role="radiogroup" aria-label="Job preference">
                          {jobTypePreferenceOptions.filter((option) => option.value !== "").map((option) => {
                            const selected = profileJobTypePreference === option.value;
                            return (
                              <button
                                type="button"
                                key={option.value}
                                className={selected ? "signup-experience-option selected" : "signup-experience-option"}
                                role="radio"
                                aria-checked={selected}
                                onClick={() => {
                                  setProfileJobTypePreference(option.value as JobTypePreference);
                                  clearProfileFieldError("job_type_preference");
                                }}
                              >
                                <span>{option.label}</span>
                                {selected ? <span className="signup-experience-check" aria-hidden><CheckCircle2 size={15} /></span> : null}
                              </button>
                            );
                          })}
                        </div>
                        {profileFieldErrors.job_type_preference ? <small className="field-error-text">{profileFieldErrors.job_type_preference}</small> : null}
                      </section>
                      <div className="cleaner-weekly-availability-grid" role="group" aria-label="Weekly availability">
                        <span className="cleaner-weekly-availability-corner" aria-hidden />
                        {weeklyDayOptions.map((day) => (
                          <span className="cleaner-weekly-availability-head" key={day.value}>{day.label}</span>
                        ))}
                        {weeklyTimeOptions.map((slot) => (
                          <div className="cleaner-weekly-availability-row" key={slot.value}>
                            <span className="cleaner-weekly-availability-slot">{slot.label}</span>
                            {weeklyDayOptions.map((day) => {
                              const selected = profileWeeklyAvailability[day.value]?.includes(slot.value) ?? false;
                              return (
                                <button
                                  type="button"
                                  key={`${day.value}-${slot.value}`}
                                  className={selected ? "cleaner-weekly-availability-cell selected" : "cleaner-weekly-availability-cell"}
                                  aria-pressed={selected}
                                  aria-label={`${day.label} ${slot.label}`}
                                  onClick={() => {
                                    toggleProfileWeeklyAvailability(day.value, slot.value);
                                    clearProfileFieldError("weekly_availability");
                                  }}
                                >
                                  {selected ? <CheckCircle2 size={14} aria-hidden /> : null}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      {profileFieldErrors.weekly_availability ? <small className="field-error-text">{profileFieldErrors.weekly_availability}</small> : null}
                    </section>
                  </form>

                  <form className="host-form cleaner-profile-form cleaner-profile-category-form" onSubmit={preventCategoryFormSubmit}>
                    <section className="cleaner-profile-section cleaner-profile-section--single" aria-labelledby="cleaner-extra-services-title">
                      <div className="cleaner-profile-section-head">
                        <h2 id="cleaner-extra-services-title">Extra services offered</h2>
                      </div>
                      <div className="cleaner-preferences-grid" role="group" aria-label="Extra services offered">
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
                        <h2 id="cleaner-introduction-title">Introduction</h2>
                      </div>
                      <label>
                        <span>Your introduction</span>
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
                          placeholder="Experience, property types, languages, availability..."
                        />
                        {profileFieldErrors.bio ? <small className="field-error-text">{profileFieldErrors.bio}</small> : null}
                      </label>
                    </section>
                  </form>

                  <div className="host-form-actions cleaner-profile-save-actions">
                    {profileSaved ? <p className="cleaner-success cleaner-profile-save-status" aria-live="polite"><CheckCircle2 size={15} aria-hidden />Profile saved.</p> : null}
                    <button
                      className="primary-link auth-submit"
                      type="button"
                      disabled={savingProfile || !hasProfileChanges || !hasSelectedDistricts}
                      onClick={() => void submitAllProfileChanges()}
                    >
                      {savingProfile ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>

                <aside className="cleaner-profile-summary">
                  <div>
                    <span>Verification</span>
                    <strong>{profile.verification_status}</strong>
                  </div>
                  <div>
                    <span>Age</span>
                    <strong>{profile.age ?? "Not set"}</strong>
                  </div>
                  <div>
                    <span>Language</span>
                    <strong>{profileNativeLanguage || "Not set"}</strong>
                  </div>
                  <div>
                    <span>Other languages</span>
                    <strong>{profileOtherLanguages.length > 0 ? profileOtherLanguages.join(", ") : "Not set"}</strong>
                  </div>
                  <div>
                    <span>Extra services</span>
                    <strong>
                      {profilePersonalPreferences.length > 0
                        ? personalPreferenceOptions
                          .filter((option) => profilePersonalPreferences.includes(option.value))
                          .map((option) => option.label)
                          .join(", ")
                        : "Not set"}
                    </strong>
                  </div>
                  <div>
                    <span>Education</span>
                    <strong>{labelFromOptions(educationOptions, profileEducation)}</strong>
                  </div>
                  <div>
                    <span>Experience</span>
                    <strong>{labelFromOptions(experienceOptions, profileExperienceLevel)}</strong>
                  </div>
                  <div>
                    <span>Job preference</span>
                    <strong>{labelFromOptions(jobTypePreferenceOptions, profileJobTypePreference)}</strong>
                  </div>
                  <div>
                    <span>Service areas</span>
                    <strong>{serviceAreasFromText(profileServiceAreas).length}</strong>
                  </div>
                  <div>
                    <span>Completed jobs</span>
                    <strong>{profile.completed_jobs_count}</strong>
                  </div>
                  <div>
                    <span>Average rating</span>
                    <strong>{Number(profile.average_rating || 0).toFixed(1)}</strong>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}
      </main>

      {districtOverlayOpen ? (
        <div className="host-modal-backdrop" onClick={closeDistrictOverlay} role="dialog" aria-modal="true" aria-label="Add districts">
          <div className="host-modal host-modal--wide" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>Add districts</h2>
                <p className="host-modal-subtitle">
                  Select districts in {selectedDistrictCity?.label ?? "the selected city"} and add them to your service areas.
                </p>
              </div>
              <button type="button" className="host-modal-close" onClick={closeDistrictOverlay} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="host-form cleaner-district-overlay-form">
              {selectedDistrictCity ? (
                <section className="zones-panel" aria-label={`${selectedDistrictCity.label} districts`}>
                  <DistrictMapSelector
                    citySlug={selectedDistrictCity.value}
                    selectedZoneIds={districtSelectedZoneIds}
                    onChange={handleDistrictSelectorChange}
                    language="bg"
                    showListFallback
                    onZonesLoaded={handleDistrictZonesLoaded}
                  />
                </section>
              ) : (
                <p className="host-form-hint">Choose a city to select districts.</p>
              )}

              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={closeDistrictOverlay}>
                  Cancel
                </button>
                <button
                  className="primary-link auth-submit"
                  type="button"
                  onClick={applyDistrictsToServiceAreas}
                  disabled={!selectedDistrictCity || districtSelectedZoneIds.length === 0}
                >
                  Add districts
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {otherLanguagesOverlayOpen ? (
        <div className="host-modal-backdrop" onClick={closeOtherLanguagesOverlay} role="dialog" aria-modal="true" aria-label="Select other languages">
          <div className="host-modal cleaner-other-languages-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>Select other languages</h2>
                <p className="host-modal-subtitle">Choose additional languages you speak besides your native language.</p>
              </div>
              <button type="button" className="host-modal-close" onClick={closeOtherLanguagesOverlay} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="host-form cleaner-other-languages-overlay-form">
              <div className="dual-zone-transfer">
                <label className="dual-zone-list">
                  <span>Available languages:</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label="Available languages">
                    <div className="dual-zone-listbox-search-wrap">
                      <input
                        className="dual-zone-search"
                        type="text"
                        placeholder="Search language"
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
                  <span>Selected languages:</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label="Selected languages">
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
              <p className="host-form-hint">Click an available language to add it. Click a selected language to remove it.</p>
              <div className="host-form-actions cleaner-other-languages-actions">
                <button className="primary-link auth-submit" type="button" onClick={closeOtherLanguagesOverlay}>
                  Done
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
          aria-label="Crop profile image"
        >
          <div className="host-modal cleaner-crop-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>Adjust profile image</h2>
              <button type="button" className="host-modal-close" onClick={closeCropEditor} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="cleaner-crop-modal-body">
              <p className="cleaner-crop-hint">
                Drag to center your photo. Use zoom to crop tighter or wider.
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
                  <span>Zoom</span>
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
                      Center image
                    </button>
                    <button
                      type="button"
                      className="secondary-link"
                      onClick={() => {
                        setCropZoomLevel(PROFILE_CROP_MIN_ZOOM);
                        resetCropPosition();
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="cleaner-crop-actions-right">
                    <button className="secondary-link" type="button" onClick={closeCropEditor}>
                      Cancel
                    </button>
                    <button className="primary-link auth-submit" type="button" onClick={applyCropResult} disabled={cropBusy}>
                      {cropBusy ? "Applying..." : "Use this image"}
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
          aria-label="Apply for job"
        >
          <div className="host-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>Apply for job</h2>
              <button type="button" className="host-modal-close" onClick={() => setApplyJob(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(event) => void submitApplication(event)}>
              <div className="cleaner-apply-summary">
                <strong>{applyJob.title}</strong>
                <span>{jobPlace(applyJob)}</span>
                <span>{fmtDateTime(applyJob.scheduled_start)} - {fmtTime(applyJob.scheduled_end)}</span>
              </div>
              <label>
                <span>Your price (EUR)</span>
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
                <span>Message to host</span>
                <textarea
                  rows={4}
                  value={applyMessage}
                  onChange={(event) => setApplyMessage(event.target.value)}
                  placeholder="Confirm availability, timing, and anything the host should know."
                />
              </label>
              {applyError && <p className="form-error">{applyError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setApplyJob(null)}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={applying}>
                  {applying ? "Sending..." : "Submit application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

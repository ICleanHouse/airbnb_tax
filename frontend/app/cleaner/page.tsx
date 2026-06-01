"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home as HomeIcon,
  LogOut,
  Plus,
  RefreshCcw,
  Send,
  Star,
  User,
  UserRoundCheck,
  X,
} from "lucide-react";
import { apiFetch, CurrentUser } from "../../lib/api";
import { cities } from "../../lib/cityDistricts";

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
  status: ApplicationStatus;
  proposed_price: string | null;
  message: string;
  created_at: string;
}

type CalendarItemType = "open_job" | "application" | "assignment";
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
  property_city: string;
  host_name: string;
  job_status: JobStatus;
  application_status: ApplicationStatus | "";
  completed_at: string | null;
  can_apply: boolean;
  can_complete: boolean;
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

type Section = "calendar" | "jobs" | "applications" | "assignments" | "profile";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
};

function calendarItemColor(item: CalendarItem) {
  if (item.item_type === "assignment") {
    return item.completed_at || item.job_status === "completed" ? "#22c55e" : "var(--gold)";
  }
  if (item.item_type === "application") {
    if (item.application_status === "accepted") return "var(--teal)";
    if (item.application_status === "rejected" || item.application_status === "withdrawn") return "var(--brand)";
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

function money(value?: string | null, currency = "EUR") {
  if (!value) return "Price open";
  return `${currency === "EUR" ? "€" : `${currency} `}${value}`;
}

function jobPlace(job?: Pick<CleaningJob, "property_name" | "property_city" | "property"> | null) {
  if (!job) return "Job details";
  const name = job.property_name || `Property #${job.property}`;
  return job.property_city ? `${name} - ${job.property_city}` : name;
}

export default function CleanerDashboard() {
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [profile, setProfile] = useState<CleanerProfile | null>(null);
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
  const [applications, setApplications] = useState<CleanerApplication[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [dataError, setDataError] = useState("");
  const [section, setSection] = useState<Section>("calendar");
  const [jobCityFilter, setJobCityFilter] = useState<string>("");

  const now = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileSex, setProfileSex] = useState<CleanerSex>("prefer_not_to_say");
  const [profileBirthDate, setProfileBirthDate] = useState("");
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
  const [profileSaved, setProfileSaved] = useState(false);
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState<string | null>(null);
  const [districtOverlayOpen, setDistrictOverlayOpen] = useState(false);
  const [districtSearch, setDistrictSearch] = useState("");
  const [districtAvailableChoice, setDistrictAvailableChoice] = useState("");
  const [districtSelectedChoice, setDistrictSelectedChoice] = useState("");
  const [districtSelectedZones, setDistrictSelectedZones] = useState<Set<string>>(new Set());
  const [districtDraggedZone, setDistrictDraggedZone] = useState<string | null>(null);
  const [districtDragSource, setDistrictDragSource] = useState<"available" | "selected" | null>(null);
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
  const [cancelingApplicationId, setCancelingApplicationId] = useState<number | null>(null);
  const [applicationActionError, setApplicationActionError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

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

  function syncProfileForm(nextProfile: CleanerProfile, nextUserNames?: { first_name: string; last_name: string }) {
    const firstName = nextUserNames?.first_name ?? me?.first_name ?? "";
    const lastName = nextUserNames?.last_name ?? me?.last_name ?? "";
    const normalizedWeeklyAvailability = normalizeWeeklyAvailability(nextProfile.weekly_availability);
    const serviceAreasText = nextProfile.service_areas.join("\n");
    const inferredCity = inferCityFromServiceAreas(serviceAreasText);

    setProfileFirstName(firstName);
    setProfileLastName(lastName);
    setProfileSex(nextProfile.sex || "prefer_not_to_say");
    setProfileBirthDate(nextProfile.birth_date || "");
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

  async function loadCalendar(year = calYear, month = calMonth) {
    setLoadingCalendar(true);
    const range = calendarRange(year, month);
    try {
      const res = await apiFetch(
        `/api/marketplace/calendar/?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
      );
      if (res.ok) {
        setCalendarItems(readList<CalendarItem>(await res.json()));
      }
    } finally {
      setLoadingCalendar(false);
    }
  }

  async function loadAll() {
    setLoadingData(true);
    setDataError("");
    try {
      const [profileRes, jobsRes, applicationsRes, assignmentsRes] = await Promise.all([
        apiFetch("/api/accounts/cleaners/"),
        apiFetch("/api/marketplace/jobs/"),
        apiFetch("/api/marketplace/applications/"),
        apiFetch("/api/marketplace/assignments/"),
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
    } catch {
      setDataError("Network error. Check that the backend is running.");
    } finally {
      setLoadingData(false);
    }
  }

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
      setProfileError("Please choose a valid image file.");
      event.target.value = "";
      return;
    }

    setProfileError("");
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
          setProfileError("Could not open this image. Please choose another file.");
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
      setProfileError(messageFromResponse(await res.json(), fallbackError));
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
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      setProfileError("First name and last name are required.");
      return;
    }
    if (!profileDistrictCity) {
      setProfileError("Choose a city before saving location details.");
      return;
    }
    const serviceAreas = normalizeServiceAreasByCity(profileServiceAreas, profileDistrictCity);
    if (serviceAreas.length === 0) {
      setProfileError("Add at least one district from the selected city.");
      return;
    }
    setProfileServiceAreas(serviceAreas.join("\n"));

    setSavingProfile(true);
    setProfileError("");
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
        setProfileError(messageFromResponse(await userRes.json(), "Could not save name details."));
        return;
      }
      const updatedUser = (await userRes.json()) as CurrentUser;
      setMe(updatedUser);

      const success = await patchCleanerProfile(
        {
          service_areas: serviceAreas,
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

  const availableDistrictZones = useMemo(
    () => selectedDistrictCity?.zones.filter((zone) => !districtSelectedZones.has(zone)) ?? [],
    [selectedDistrictCity, districtSelectedZones],
  );

  const selectedDistrictZoneList = useMemo(
    () => selectedDistrictCity?.zones.filter((zone) => districtSelectedZones.has(zone)) ?? [],
    [selectedDistrictCity, districtSelectedZones],
  );

  const filteredAvailableDistrictZones = useMemo(() => {
    const query = districtSearch.trim().toLocaleLowerCase();
    if (!query) return availableDistrictZones;
    return availableDistrictZones.filter((zone) => zone.toLocaleLowerCase().includes(query));
  }, [availableDistrictZones, districtSearch]);

  function openDistrictOverlay() {
    if (!selectedDistrictCity) {
      setProfileError("Choose a city first.");
      return;
    }
    const existingAreas = serviceAreasFromText(profileServiceAreas);
    const zoneSet = new Set<string>();
    for (const zone of selectedDistrictCity.zones) {
      if (existingAreas.includes(zone)) zoneSet.add(zone);
    }
    setDistrictSelectedZones(zoneSet);
    setDistrictSearch("");
    setDistrictAvailableChoice("");
    setDistrictSelectedChoice("");
    setDistrictOverlayOpen(true);
    setProfileError("");
  }

  function closeDistrictOverlay() {
    setDistrictOverlayOpen(false);
    setDistrictSearch("");
    setDistrictAvailableChoice("");
    setDistrictSelectedChoice("");
  }

  function addSelectedDistrict() {
    if (!districtAvailableChoice) return;
    setDistrictSelectedZones((current) => new Set(current).add(districtAvailableChoice));
    setDistrictAvailableChoice("");
  }

  function removeSelectedDistrict() {
    if (!districtSelectedChoice) return;
    setDistrictSelectedZones((current) => {
      const next = new Set(current);
      next.delete(districtSelectedChoice);
      return next;
    });
    setDistrictSelectedChoice("");
  }

  function selectAllDistricts() {
    if (!selectedDistrictCity) return;
    setDistrictSelectedZones(new Set(selectedDistrictCity.zones));
  }

  function clearAllDistricts() {
    setDistrictSelectedZones(new Set());
  }

  function applyDistrictsToServiceAreas() {
    if (!selectedDistrictCity) return;
    const nextAreas = [...selectedDistrictZoneList];
    setProfileServiceAreas(nextAreas.join("\n"));
    closeDistrictOverlay();
  }

  function handleDropToSelectedDistricts() {
    if (districtDragSource !== "available" || !districtDraggedZone) return;
    setDistrictSelectedZones((current) => new Set(current).add(districtDraggedZone));
    setDistrictDraggedZone(null);
    setDistrictDragSource(null);
    setDistrictAvailableChoice("");
  }

  function handleDropToAvailableDistricts() {
    if (districtDragSource !== "selected" || !districtDraggedZone) return;
    setDistrictSelectedZones((current) => {
      const next = new Set(current);
      next.delete(districtDraggedZone);
      return next;
    });
    setDistrictDraggedZone(null);
    setDistrictDragSource(null);
    setDistrictSelectedChoice("");
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
  const pendingApplications = applications.filter((application) => application.status === "pending").length;
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
            Calendar
            {calendarItems.length > 0 && <span className="host-tab-count">{calendarItems.length}</span>}
          </button>
          <button
            type="button"
            className={`host-tab${section === "jobs" ? " active" : ""}`}
            onClick={() => setSection("jobs")}
          >
            <Briefcase size={15} aria-hidden />
            Open jobs
            {openJobs.length > 0 && <span className="host-tab-count">{openJobs.length}</span>}
          </button>
          <button
            type="button"
            className={`host-tab${section === "applications" ? " active" : ""}`}
            onClick={() => setSection("applications")}
          >
            <Send size={15} aria-hidden />
            Applications
            {pendingApplications > 0 && <span className="host-tab-count">{pendingApplications}</span>}
          </button>
          <button
            type="button"
            className={`host-tab${section === "assignments" ? " active" : ""}`}
            onClick={() => setSection("assignments")}
          >
            <ClipboardList size={15} aria-hidden />
            Assigned
            {activeAssignments.length > 0 && <span className="host-tab-count">{activeAssignments.length}</span>}
          </button>
        </nav>

        <div className="host-topbar-right">
          <span className="user-chip">
            {displayName}
            <span className="user-chip-dot" aria-hidden>·</span>
            Cleaner
          </span>
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
                <h1 className="host-section-title">Calendar</h1>
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
                          <div className="host-cal-dots">
                            {dayItems.slice(0, 4).map((item) => (
                              <span
                                key={item.id}
                                className="host-cal-dot"
                                style={{ background: calendarItemColor(item) }}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="host-cal-legend">
                    <span className="host-cal-legend-item">
                      <span className="host-cal-dot" style={{ background: "var(--teal)" }} />
                      Open
                    </span>
                    <span className="host-cal-legend-item">
                      <span className="host-cal-dot" style={{ background: "var(--gold)" }} />
                      Applied / assigned
                    </span>
                    <span className="host-cal-legend-item">
                      <span className="host-cal-dot" style={{ background: "#22c55e" }} />
                      Done
                    </span>
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
                              <span className={`cleaner-application-chip cleaner-calendar-chip cleaner-calendar-${item.item_type}`}>
                                {item.item_type === "application" && item.application_status
                                  ? APPLICATION_LABEL[item.application_status]
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
                              {item.can_complete && (
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

        {section === "jobs" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Marketplace</p>
                <h1 className="host-section-title">Open cleaning jobs</h1>
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

            <div className="cleaner-summary-grid">
              <article>
                <Briefcase size={18} aria-hidden />
                <span>Open jobs</span>
                <strong>{openJobs.length}</strong>
              </article>
              <article>
                <Send size={18} aria-hidden />
                <span>Pending applications</span>
                <strong>{pendingApplications}</strong>
              </article>
              <article>
                <ClipboardList size={18} aria-hidden />
                <span>Assigned jobs</span>
                <strong>{activeAssignments.length}</strong>
              </article>
              <article>
                <Star size={18} aria-hidden />
                <span>Rating</span>
                <strong>{Number(profile?.average_rating ?? 0).toFixed(1)}</strong>
              </article>
            </div>

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

            {loadingData ? (
              <p className="host-empty">Loading jobs...</p>
            ) : openJobs.length === 0 ? (
              <div className="host-empty-state">
                <Briefcase size={40} />
                <p>{jobCityFilter ? `No open jobs in ${jobCityFilter} right now.` : "No open jobs are visible right now."}</p>
              </div>
            ) : (
              <ul className="cleaner-job-list">
                {openJobs.map((job) => {
                  const application = applicationsByJob.get(job.id);
                  const disabledReason = !me.is_approved
                    ? "Account approval required"
                    : !profile?.is_verified
                      ? "Profile verification required"
                      : "";
                  return (
                    <li key={job.id} className="cleaner-job-card">
                      <div className="cleaner-job-main">
                        <div>
                          <strong>{job.title}</strong>
                          <span className="job-location-tag">
                            {job.property_city ?? ""}
                            {job.property_neighborhood ? (
                              <span className="job-location-neighborhood">{job.property_neighborhood}</span>
                            ) : null}
                            {job.property_name ? ` · ${job.property_name}` : ""}
                          </span>
                        </div>
                        {(job.description || job.cleaning_instructions) && (
                          <p>{job.description || job.cleaning_instructions}</p>
                        )}
                        <div className="cleaner-job-meta">
                          <span><CalendarDays size={14} aria-hidden />{fmtDateTime(job.scheduled_start)} - {fmtTime(job.scheduled_end)}</span>
                          <span>{money(job.proposed_price, job.currency)}</span>
                        </div>
                      </div>
                      <div className="cleaner-job-actions">
                        <span className={`host-job-badge host-job-badge--${job.status}`}>
                          {STATUS_LABEL[job.status]}
                        </span>
                        {application ? (
                          <span className={`cleaner-application-chip cleaner-application-${application.status}`}>
                            {APPLICATION_LABEL[application.status]}
                          </span>
                        ) : (
                          <button
                            className="cleaner-action-primary"
                            type="button"
                            disabled={!canApply}
                            title={disabledReason}
                            onClick={() => openApply(job)}
                          >
                            <Send size={14} aria-hidden />
                            Apply
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

        {section === "applications" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{applications.length} total</p>
                <h1 className="host-section-title">Applications</h1>
              </div>
            </div>

            {loadingData ? (
              <p className="host-empty">Loading applications...</p>
            ) : applications.length === 0 ? (
              <div className="host-empty-state">
                <Send size={40} />
                <p>Your applications will appear here.</p>
              </div>
            ) : (
              <>
                {applicationActionError ? <p className="form-error">{applicationActionError}</p> : null}
                <ul className="cleaner-job-list">
                  {applications.map((application) => {
                    const job = jobById.get(application.job);
                    return (
                      <li key={application.id} className="cleaner-job-card cleaner-compact-card">
                        <div className="cleaner-job-main">
                          <div>
                            <strong>{application.job_title || job?.title || `Job #${application.job}`}</strong>
                            <span>{application.job_property_name || jobPlace(job)}</span>
                          </div>
                          <div className="cleaner-job-meta">
                            <span><CalendarDays size={14} aria-hidden />{fmtDateTime(application.job_scheduled_start || job?.scheduled_start)}</span>
                            <span>{money(application.proposed_price, job?.currency)}</span>
                          </div>
                          {application.message && <p>{application.message}</p>}
                        </div>
                        <div className="cleaner-job-actions">
                          <span className={`cleaner-application-chip cleaner-application-${application.status}`}>
                            {APPLICATION_LABEL[application.status]}
                          </span>
                          {application.status === "pending" ? (
                            <button
                              className="cleaner-action-primary cleaner-action-cancel"
                              type="button"
                              disabled={cancelingApplicationId === application.id}
                              onClick={() => void cancelApplication(application.id)}
                            >
                              <X size={14} aria-hidden />
                              {cancelingApplicationId === application.id ? "Canceling..." : "Cancel application"}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {section === "assignments" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{assignments.length} accepted</p>
                <h1 className="host-section-title">Assigned jobs</h1>
              </div>
            </div>

            {loadingData ? (
              <p className="host-empty">Loading assignments...</p>
            ) : assignments.length === 0 ? (
              <div className="host-empty-state">
                <ClipboardList size={40} />
                <p>Accepted jobs will appear here.</p>
              </div>
            ) : (
              <ul className="cleaner-job-list">
                {assignments.map((assignment) => {
                  const job = jobById.get(assignment.job);
                  const jobStatus = job?.status || assignment.job_status || "assigned";
                  const isComplete = Boolean(assignment.completed_at || jobStatus === "completed");
                  return (
                    <li key={assignment.id} className="cleaner-job-card">
                      <div className="cleaner-job-main">
                        <div>
                          <strong>{assignment.job_title || job?.title || `Job #${assignment.job}`}</strong>
                          <span>{assignment.job_property_name || jobPlace(job)}</span>
                        </div>
                        <div className="cleaner-job-meta">
                          <span><CalendarDays size={14} aria-hidden />{fmtDateTime(assignment.job_scheduled_start || job?.scheduled_start)} - {fmtTime(assignment.job_scheduled_end || job?.scheduled_end)}</span>
                          <span>{money(assignment.agreed_price || job?.agreed_price || job?.proposed_price, job?.currency)}</span>
                        </div>
                      </div>
                      <div className="cleaner-job-actions">
                        <span className={`host-job-badge host-job-badge--${jobStatus}`}>
                          {isComplete ? "Done" : STATUS_LABEL[jobStatus]}
                        </span>
                        {!isComplete && (
                          <button
                            className="cleaner-action-primary cleaner-action-complete"
                            type="button"
                            disabled={completingJobId === assignment.job}
                            onClick={() => void completeJob(assignment.job)}
                          >
                            <CheckCircle2 size={14} aria-hidden />
                            {completingJobId === assignment.job ? "Saving..." : "Mark done"}
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
                        </label>
                        <div className="form-grid">
                          <label>
                            <span>First name</span>
                            <input value={profileFirstName} onChange={(event) => setProfileFirstName(event.target.value)} />
                          </label>
                          <label>
                            <span>Last name</span>
                            <input value={profileLastName} onChange={(event) => setProfileLastName(event.target.value)} />
                          </label>
                          <label className="cleaner-account-email-field">
                            <span>Email</span>
                            <input value={me.email} readOnly />
                          </label>
                          <label className="cleaner-sex-picker">
                            <span>Sex</span>
                            <select value={profileSex} onChange={(event) => setProfileSex(event.target.value as CleanerSex)}>
                              {sexOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Date of birth</span>
                            <input type="date" value={profileBirthDate} onChange={(event) => setProfileBirthDate(event.target.value)} />
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
                          value={profileDistrictCity}
                          onChange={(event) => {
                            const nextCity = event.target.value;
                            setProfileDistrictCity(nextCity);
                            setDistrictSelectedZones(new Set());
                            setDistrictAvailableChoice("");
                            setDistrictSelectedChoice("");
                            const normalizedAreas = normalizeServiceAreasByCity(profileServiceAreas, nextCity);
                            setProfileServiceAreas(normalizedAreas.join("\n"));
                          }}
                        >
                          <option value="">Choose city</option>
                          {cities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
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
                          <select value={profileNativeLanguage} onChange={(event) => setProfileNativeLanguage(event.target.value)}>
                            {nativeLanguageOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Education</span>
                          <select value={profileEducation} onChange={(event) => setProfileEducation(event.target.value)}>
                            {educationOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Cleaning experience</span>
                          <select value={profileExperienceLevel} onChange={(event) => setProfileExperienceLevel(event.target.value)}>
                            {experienceOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Driving license</span>
                          <select value={profileHasDrivingLicense} onChange={(event) => setProfileHasDrivingLicense(event.target.value as "" | "yes" | "no")}>
                            {profileHasDrivingLicense === "" ? <option value="">Select</option> : null}
                            <option value="yes">I have a driving license</option>
                            <option value="no">I don&apos;t have a driving license</option>
                          </select>
                        </label>
                        {profileHasDrivingLicense === "yes" ? (
                          <label>
                            <span>Personal car</span>
                            <select value={profileHasOwnCar} onChange={(event) => setProfileHasOwnCar(event.target.value as "" | "yes" | "no")}>
                              {profileHasOwnCar === "" ? <option value="">Select</option> : null}
                              <option value="yes">I have a personal car</option>
                              <option value="no">I don&apos;t have a personal car</option>
                            </select>
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
                                onClick={() => setProfileJobTypePreference(option.value as JobTypePreference)}
                              >
                                <span>{option.label}</span>
                                {selected ? <span className="signup-experience-check" aria-hidden><CheckCircle2 size={15} /></span> : null}
                              </button>
                            );
                          })}
                        </div>
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
                                  onClick={() => toggleProfileWeeklyAvailability(day.value, slot.value)}
                                >
                                  {selected ? <CheckCircle2 size={14} aria-hidden /> : null}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
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
                                onClick={() => togglePersonalPreference(option.value)}
                              >
                                <span className="cleaner-switch-toggle-thumb" aria-hidden />
                              </button>
                            </label>
                          );
                        })}
                      </div>
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
                          rows={5}
                          maxLength={1500}
                          value={profileBio}
                          onChange={(event) => setProfileBio(event.target.value)}
                          placeholder="Experience, property types, languages, availability..."
                        />
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
                  <header className="zones-panel-head">
                    <strong>Area selection</strong>
                    <div className="zones-actions">
                      <button type="button" onClick={selectAllDistricts}>Select all</button>
                      <button type="button" onClick={clearAllDistricts}>Clear all</button>
                    </div>
                  </header>
                  <div className="dual-zone-transfer">
                    <label className="dual-zone-list">
                      <span>List of Districts:</span>
                      <div
                        className="dual-zone-listbox"
                        role="listbox"
                        aria-label="List of Districts"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDropToAvailableDistricts}
                      >
                        <div className="dual-zone-listbox-search-wrap">
                          <input
                            className="dual-zone-search"
                            type="text"
                            placeholder="Search district"
                            value={districtSearch}
                            onChange={(event) => setDistrictSearch(event.target.value)}
                          />
                        </div>
                        <div className="dual-zone-items">
                          {filteredAvailableDistrictZones.map((zone) => (
                            <button
                              type="button"
                              key={zone}
                              className={districtAvailableChoice === zone ? "dual-zone-item selected" : "dual-zone-item"}
                              onClick={() => setDistrictAvailableChoice(zone)}
                              onDoubleClick={() => {
                                setDistrictSelectedZones((current) => new Set(current).add(zone));
                                setDistrictAvailableChoice("");
                              }}
                              draggable
                              onDragStart={() => {
                                setDistrictDraggedZone(zone);
                                setDistrictDragSource("available");
                              }}
                              onDragEnd={() => {
                                setDistrictDraggedZone(null);
                                setDistrictDragSource(null);
                              }}
                            >
                              {zone}
                            </button>
                          ))}
                        </div>
                      </div>
                    </label>
                    <div className="dual-zone-controls">
                      <button type="button" onClick={addSelectedDistrict} disabled={!districtAvailableChoice}>{">"}</button>
                      <button type="button" onClick={removeSelectedDistrict} disabled={!districtSelectedChoice}>{"<"}</button>
                    </div>
                    <label className="dual-zone-list">
                      <span>Selected Districts:</span>
                      <div
                        className="dual-zone-listbox"
                        role="listbox"
                        aria-label="Selected Districts"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDropToSelectedDistricts}
                      >
                        <div className="dual-zone-items">
                          {selectedDistrictZoneList.map((zone) => (
                            <button
                              type="button"
                              key={zone}
                              className={districtSelectedChoice === zone ? "dual-zone-item selected" : "dual-zone-item"}
                              onClick={() => setDistrictSelectedChoice(zone)}
                              onDoubleClick={() => {
                                setDistrictSelectedZones((current) => {
                                  const next = new Set(current);
                                  next.delete(zone);
                                  return next;
                                });
                                setDistrictSelectedChoice("");
                              }}
                              draggable
                              onDragStart={() => {
                                setDistrictDraggedZone(zone);
                                setDistrictDragSource("selected");
                              }}
                              onDragEnd={() => {
                                setDistrictDraggedZone(null);
                                setDistrictDragSource(null);
                              }}
                            >
                              {zone}
                            </button>
                          ))}
                        </div>
                      </div>
                    </label>
                  </div>
                </section>
              ) : (
                <p className="host-form-hint">Choose a city to select districts.</p>
              )}

              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={closeDistrictOverlay}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="button" onClick={applyDistrictsToServiceAreas} disabled={!selectedDistrictCity}>
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

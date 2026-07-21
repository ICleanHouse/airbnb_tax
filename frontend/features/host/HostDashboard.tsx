"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { LocationResult } from "../../components/PropertyLocationPicker";

const PropertyLocationPicker = dynamic(
  () => import("../../components/PropertyLocationPicker"),
  { ssr: false, loading: () => <div className="prop-map-loading">Loading map…</div> },
);
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home as HomeIcon,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Users,
  Heart,
  Send,
  X,
  User,
  UserRoundCheck,
} from "lucide-react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch, CurrentUser, type FavouriteCleaner } from "../../lib/api";
import VerificationStatusSummary from "../../components/VerificationStatusSummary";
import { formatMoney } from "../../lib/money";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import { useRefocusClickGuard } from "../../lib/useRefocusClickGuard";
import CleanerProfileModal from "../../components/CleanerProfileModal";
import NotificationBell from "../../components/NotificationBell";
import Connections from "../../components/Connections";
import AppdashGrid from "../../components/AppdashGrid";
import { useAppdashPrefs } from "../../lib/useAppdashPrefs";
import {
  PROPERTY_IMAGE_MAX_BYTES,
  validateIcsFile,
  validateImageFile,
} from "../../lib/uploadValidation";
import JobOfferModal from "../../components/JobOfferModal";
import ReviewModal from "../../components/ReviewModal";
import RatingStars from "../../components/RatingStars";
import AccountDeletionPanel from "../../components/AccountDeletionPanel";
import CancelJobDialog from "../../components/CancelJobDialog";
import DistrictMapSelector from "../../components/DistrictMapSelector";

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface IcsEvent {
  uid: string;
  summary: string;
  checkin: string;   // "YYYY-MM-DD"
  checkout: string;  // "YYYY-MM-DD" — the day cleaning happens
  nights: number;
}

interface PropertyImage {
  id: number;
  content_url: string;
  caption: string;
  order: number;
}

interface Property {
  id: number;
  name: string;
  city: string;
  neighborhood: string;
  service_zone_id: string | null;
  service_zone_name_bg: string;
  service_zone_name_en: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  description: string;
  bedrooms: number | null;
  square_meters: string | null;
  default_cleaning_duration_minutes: number;
  default_price_eur: string | null;
  images: PropertyImage[];
}

type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

interface CleanerApplication {
  id: number;
  job: number;
  job_title: string;
  job_scheduled_start: string;
  job_scheduled_end: string;
  job_status: string;
  job_property_name: string;
  job_property_city: string;
  job_property_neighborhood: string;
  job_proposed_price: string | null;
  cleaner: number;
  cleaner_name: string;
  cleaner_email: string;
  cleaner_profile_id: number | null;
  status: ApplicationStatus;
  origin: "cleaner_applied" | "host_offered";
  proposed_price: string | null;
  message: string;
  created_at: string;
}

interface HostAssignment {
  id: number;
  job: number;
  job_title: string;
  job_scheduled_start: string;
  job_scheduled_end: string;
  job_status: string;
  job_property_name: string;
  job_property_city: string;
  cleaner: number;
  cleaner_name: string;
  cleaner_email: string;
  cleaner_profile_image?: string | null;
  agreed_price: string | null;
  host_completed_at: string | null;
  cleaner_completed_at: string | null;
  completed_at: string | null;
  assigned_at: string;
}

type JobStatus = "draft" | "open" | "assigned" | "completed" | "cancelled";

interface CleaningJob {
  id: number;
  property: number;
  title: string;
  scheduled_start: string; // ISO 8601
  scheduled_end: string;
  proposed_price: string | null;
  status: JobStatus;
  description: string;
  available_actions?: string[];
}

// ── Calendar helpers ───────────────────────────────────────────────────────────

/** First weekday of month, Mon = 0 */
function firstWeekday(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Client-side validation for the property size (m²): empty is allowed, otherwise
 * it must be a positive whole or half number (a multiple of 0.5). Returns a
 * user-facing message, or "" when valid. Validated in React so the user never
 * has to round-trip to the server for this.
 */
function sqmError(value: string, errorZero: string, errorHalf: string): string {
  const v = value.trim();
  if (v === "") return "";
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return errorZero;
  if (!Number.isInteger(num * 2)) return errorHalf;
  return "";
}

// ── Status display ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<JobStatus, string> = {
  draft:     "var(--muted)",
  open:      "var(--teal)",
  assigned:  "var(--gold)",
  completed: "#22c55e",
  cancelled: "var(--brand)",
};

// ── Format helpers ─────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isPastDateTime(iso?: string | null, now = new Date()) {
  if (!iso) return false;
  return new Date(iso).getTime() <= now.getTime();
}

/** Naive date-only slice — avoids TZ shifting for calendar dot placement */
function dateOnly(iso: string) { return iso.slice(0, 10); }

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function HostDashboard() {
  const t = useTranslations("host");
  const tC = useTranslations("common");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const MONTHS = tC.raw("monthsFull") as string[];
  const DAYS = tC.raw("calDays") as string[];
  const STATUS_LABEL: Record<JobStatus, string> = {
    draft:     t("jobs.status.draft"),
    open:      t("jobs.status.open"),
    assigned:  t("jobs.status.assigned"),
    completed: t("jobs.status.completed"),
    cancelled: t("jobs.status.cancelled"),
  };
  const sqmErr = (value: string) => sqmError(value, t("propForm.sqmErrorZero"), t("propForm.sqmErrorHalf"));

  const searchParams = useSearchParams();
  const [me, setMe]           = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [properties,   setProperties]   = useState<Property[]>([]);
  // Full datasets from the API; the dashboard renders SCOPED views derived below
  // (filtered by the selected property in the left rail). Keep the originals as
  // `all*` and re-derive `jobs`/`applications`/`assignments` as memos.
  const [allJobs,         setAllJobs]         = useState<CleaningJob[]>([]);
  const [allApplications, setAllApplications] = useState<CleanerApplication[]>([]);
  const [allAssignments,  setAllAssignments]  = useState<HostAssignment[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [loadingData,  setLoadingData]  = useState(false);
  const [dataError,    setDataError]    = useState("");
  const [actingAppId,  setActingAppId]  = useState<number | null>(null);   // which app is being accepted/rejected
  const [cancelJobTarget, setCancelJobTarget] = useState<CleaningJob | null>(null);
  const [expandedAppsJobId, setExpandedAppsJobId] = useState<number | null>(null); // job whose applicants are shown in the calendar panel

  // ── Reviews ────────────────────────────────────────────────────────────────
  const [reviews,         setReviews]         = useState<Review[]>([]);
  const [reviewTarget, setReviewTarget] = useState<
    { jobId: number; jobTitle: string; revieweeId: number; revieweeName: string } | null
  >(null);
  const autoOpenedReviewJobIdRef = useRef<number | null>(null);
  const [appFilter, setAppFilter] = useState<"pending" | "active" | "completed" | "open" | "rating" | null>(null);
  const appdash = useAppdashPrefs(me);
  const shouldSuppressModalOpen = useRefocusClickGuard();

  const [section, setSection] = useState<"jobs" | "applications" | "account">("jobs");

  // ── Account menu ─────────────────────────────────────────────────────────
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Property-scoped views (left rail) ───────────────────────────────────────
  // When a property is selected, every downstream consumer of jobs/applications/
  // assignments automatically scopes to it (calendar, Applications, appdash, the
  // "Spent" card). When null, the full datasets pass through unchanged.
  const jobs = useMemo(
    () => (selectedPropertyId == null ? allJobs : allJobs.filter((j) => j.property === selectedPropertyId)),
    [allJobs, selectedPropertyId],
  );
  const scopedJobIds = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);
  const applications = useMemo(
    () => (selectedPropertyId == null ? allApplications : allApplications.filter((a) => scopedJobIds.has(a.job))),
    [allApplications, scopedJobIds, selectedPropertyId],
  );
  const assignments = useMemo(
    () => (selectedPropertyId == null ? allAssignments : allAssignments.filter((a) => scopedJobIds.has(a.job))),
    [allAssignments, scopedJobIds, selectedPropertyId],
  );

  // ── Calendar ───────────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);
  const [calYear,     setCalYear]     = useState(now.getFullYear());
  const [calMonth,    setCalMonth]    = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // ── Property form ──────────────────────────────────────────────────────────
  const [showPropForm, setShowPropForm]  = useState(false);
  const [editingPropId, setEditingPropId] = useState<number | null>(null);   // null = create mode
  const editingPropHasActiveJobs = useMemo(() => {
    if (editingPropId === null) return false;
    return allJobs.some(
      (j) => j.property === editingPropId && ["draft", "open", "assigned"].includes(j.status),
    );
  }, [allJobs, editingPropId]);
  const [propName,          setPropName]          = useState("");
  const [propCity,          setPropCity]          = useState("Sofia");
  const [propAddress,       setPropAddress]       = useState("");
  const [propNeighborhood,  setPropNeighborhood]  = useState("");
  const [propServiceZoneId, setPropServiceZoneId] = useState("");
  const [propServiceZoneName, setPropServiceZoneName] = useState("");
  const [propLat,           setPropLat]           = useState<number | null>(null);
  const [propLng,           setPropLng]           = useState<number | null>(null);
  const [propDescription,   setPropDescription]   = useState("");
  const [propBedrooms,      setPropBedrooms]      = useState("");
  const [propSqm,           setPropSqm]           = useState("");
  const [propDuration,      setPropDuration]      = useState("120");
  const [propPrice,         setPropPrice]         = useState("");
  const [savingProp,        setSavingProp]        = useState(false);
  const [propError,         setPropError]         = useState("");

  // Photo upload state
  const [existingImages,    setExistingImages]    = useState<PropertyImage[]>([]);
  const [newImageFiles,     setNewImageFiles]     = useState<File[]>([]);
  const [newImagePreviews,  setNewImagePreviews]  = useState<string[]>([]);
  const [deletingImageIds,  setDeletingImageIds]  = useState<Set<number>>(new Set());
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Job form ───────────────────────────────────────────────────────────────
  // ── Host account/profile form ────────────────────────────────────────────
  const [accountFirstName, setAccountFirstName] = useState("");
  const [accountLastName,  setAccountLastName]  = useState("");
  const [accountPhone,     setAccountPhone]     = useState("");
  const [accountLanguage,  setAccountLanguage]  = useState<"bg" | "en">("bg");
  const [accountCompany,   setAccountCompany]   = useState("");
  const [accountCity,      setAccountCity]      = useState("");
  const [accountNotes,     setAccountNotes]     = useState("");
  const [hostProfileId,    setHostProfileId]    = useState<number | null>(null);
  const [accountLoaded,    setAccountLoaded]    = useState(false);
  const [savingAccount,    setSavingAccount]    = useState(false);
  const [accountError,     setAccountError]     = useState("");
  const [accountSaved,     setAccountSaved]     = useState(false);

  const [showJobForm,    setShowJobForm]    = useState(false);
  const [jobPropId,      setJobPropId]      = useState("");
  const [jobTitle,       setJobTitle]       = useState("");
  const [jobDate,        setJobDate]        = useState("");
  const [jobStartTime,   setJobStartTime]   = useState("10:00");
  const [jobEndTime,     setJobEndTime]     = useState("12:00");
  const [jobPrice,       setJobPrice]       = useState("");
  const [jobDesc,        setJobDesc]        = useState("");
  const [savingJob,      setSavingJob]      = useState(false);
  const [jobError,       setJobError]       = useState("");

  // ── ICS import ─────────────────────────────────────────────────────────────
  const [showIcsModal,   setShowIcsModal]   = useState(false);
  const [icsStep,        setIcsStep]        = useState<1 | 2>(1);
  const [icsPropId,      setIcsPropId]      = useState("");
  const [icsFile,        setIcsFile]        = useState<File | null>(null);
  const [icsEvents,      setIcsEvents]      = useState<IcsEvent[]>([]);
  const [icsSelected,    setIcsSelected]    = useState<Set<string>>(new Set());
  const [icsStartTime,   setIcsStartTime]   = useState("10:00");
  const [icsParsing,     setIcsParsing]     = useState(false);
  const [icsImporting,   setIcsImporting]   = useState(false);
  const [icsError,       setIcsError]       = useState("");
  const [icsImportDone,  setIcsImportDone]  = useState<{ created: number; skipped: number } | null>(null);

  // ── Edit job ───────────────────────────────────────────────────────────────
  const [editingJobId,   setEditingJobId]   = useState<number | null>(null);

  // ── View cleaner profile ───────────────────────────────────────────────────
  const [viewProfileId,  setViewProfileId]  = useState<number | null>(null);

  // ── Favourites + direct offers ─────────────────────────────────────────────
  const [favourites, setFavourites] = useState<FavouriteCleaner[]>([]);
  const [offerTarget, setOfferTarget] = useState<{ userId: number; name: string } | null>(null);

  const requestedSection = searchParams.get("section");
  const requestedAppFilter = searchParams.get("appFilter");
  const reviewJobParam = searchParams.get("reviewJob");
  const requestedReviewJobId = reviewJobParam ? Number(reviewJobParam) : null;

  useEffect(() => {
    if (!requestedReviewJobId || Number.isNaN(requestedReviewJobId)) {
      autoOpenedReviewJobIdRef.current = null;
    }
  }, [requestedReviewJobId]);

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/accounts/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CurrentUser | null) => setMe(d))
      .finally(() => setLoadingMe(false));
  }, []);

  // ── Load data once approved host confirmed ─────────────────────────────────
  useEffect(() => {
    if (me?.role === "host" && me.is_approved) void loadAll();
  }, [me]);

  useEffect(() => {
    if (
      requestedSection === "applications"
      || requestedSection === "jobs"
      || requestedSection === "account"
    ) {
      setSection(requestedSection);
    }
  }, [requestedSection]);

  // Close the account menu on outside-click / Escape.
  useEffect(() => {
    if (!accountMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [accountMenuOpen]);

  // Populate the account form the first time the account section is opened.
  useEffect(() => {
    if (section !== "account" || accountLoaded || !me) return;
    setAccountFirstName(me.first_name ?? "");
    setAccountLastName(me.last_name ?? "");
    setAccountPhone(me.phone_number ?? "");
    setAccountLanguage(me.preferred_language ?? "bg");
    void apiFetch("/api/accounts/hosts/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        const list = Array.isArray(d) ? d : ((d as { results?: unknown[] } | null)?.results ?? []);
        const hp = list[0] as { id: number; company_name?: string; city?: string; notes?: string } | undefined;
        if (hp) {
          setHostProfileId(hp.id);
          setAccountCompany(hp.company_name ?? "");
          setAccountCity(hp.city ?? "");
          setAccountNotes(hp.notes ?? "");
        }
        setAccountLoaded(true);
      });
  }, [section, accountLoaded, me]);

  // Auto-hide the "saved" confirmation.
  useEffect(() => {
    if (!accountSaved) return;
    const t = window.setTimeout(() => setAccountSaved(false), 4000);
    return () => window.clearTimeout(t);
  }, [accountSaved]);

  useEffect(() => {
    if (
      requestedAppFilter === "pending"
      || requestedAppFilter === "active"
      || requestedAppFilter === "completed"
      || requestedAppFilter === "open"
      || requestedAppFilter === "rating"
    ) {
      setAppFilter(requestedAppFilter);
    }
  }, [requestedAppFilter]);

  async function loadAll(silent = false) {
    if (!silent) {
      setLoadingData(true);
      setDataError("");
    }
    try {
      const [pRes, jRes, aRes, asRes, rvRes, fvRes] = await Promise.all([
        apiFetch("/api/properties/properties/"),
        apiFetch("/api/marketplace/jobs/"),
        apiFetch("/api/marketplace/applications/"),
        apiFetch("/api/marketplace/assignments/"),
        apiFetch("/api/feedback/reviews/"),
        apiFetch("/api/marketplace/favourites/"),
      ]);
      if (pRes.ok) {
        const d: unknown = await pRes.json();
        setProperties(Array.isArray(d) ? d as Property[] : (d as { results: Property[] }).results ?? []);
      } else if (!silent) {
        setDataError(t("errors.loadProperties"));
      }
      if (jRes.ok) {
        const d: unknown = await jRes.json();
        setAllJobs(Array.isArray(d) ? d as CleaningJob[] : (d as { results: CleaningJob[] }).results ?? []);
      }
      if (aRes.ok) {
        const d: unknown = await aRes.json();
        setAllApplications(Array.isArray(d) ? d as CleanerApplication[] : (d as { results: CleanerApplication[] }).results ?? []);
      }
      if (asRes.ok) {
        const d: unknown = await asRes.json();
        setAllAssignments(Array.isArray(d) ? d as HostAssignment[] : (d as { results: HostAssignment[] }).results ?? []);
      }
      if (rvRes.ok) {
        const d: unknown = await rvRes.json();
        setReviews(Array.isArray(d) ? d as Review[] : (d as { results: Review[] }).results ?? []);
      }
      if (fvRes.ok) {
        const d: unknown = await fvRes.json();
        setFavourites(Array.isArray(d) ? d as FavouriteCleaner[] : (d as { results: FavouriteCleaner[] }).results ?? []);
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
      if (me?.role !== "host" || !me.is_approved) return;
      void loadAll(true);
    },
    { enabled: me?.role === "host" && me.is_approved },
  );

  // ── Favourite (saved cleaner) helpers ──────────────────────────────────────
  function isFavourited(cleanerUserId: number): boolean {
    return favourites.some((f) => f.cleaner === cleanerUserId);
  }

  async function toggleFavourite(cleanerUserId: number) {
    const existing = favourites.find((f) => f.cleaner === cleanerUserId);
    if (existing) {
      const res = await apiFetch(`/api/marketplace/favourites/${existing.id}/`, { method: "DELETE" });
      if (res.ok) setFavourites((prev) => prev.filter((f) => f.id !== existing.id));
      return;
    }
    const res = await apiFetch("/api/marketplace/favourites/", {
      method: "POST",
      body: JSON.stringify({ cleaner_id: cleanerUserId }),
    });
    if (res.ok) {
      const fav = (await res.json()) as FavouriteCleaner;
      setFavourites((prev) => [fav, ...prev.filter((f) => f.id !== fav.id)]);
    }
  }

  // ── Open property form ─────────────────────────────────────────────────────
  // Restore the property rail's collapsed/expanded preference.
  useEffect(() => {
    if (localStorage.getItem("hc:railExpanded") === "1") setRailExpanded(true);
  }, []);
  function toggleRail() {
    setRailExpanded((v) => {
      const next = !v;
      localStorage.setItem("hc:railExpanded", next ? "1" : "0");
      return next;
    });
  }

  function openCreateProp() {
    if (shouldSuppressModalOpen()) return;
    setEditingPropId(null);
    setPropName(""); setPropCity("Sofia"); setPropAddress(""); setPropNeighborhood("");
    setPropServiceZoneId(""); setPropServiceZoneName("");
    setPropLat(null); setPropLng(null);
    setPropDescription(""); setPropBedrooms(""); setPropSqm("");
    setPropDuration("120"); setPropPrice("");
    setExistingImages([]); setNewImageFiles([]); setNewImagePreviews([]);
    setDeletingImageIds(new Set());
    setPropError("");
    setShowPropForm(true);
  }

  function openEditProp(p: Property) {
    if (shouldSuppressModalOpen()) return;
    setEditingPropId(p.id);
    setPropName(p.name);
    setPropCity(p.city);
    setPropAddress(p.address ?? "");
    setPropNeighborhood(p.neighborhood ?? "");
    setPropServiceZoneId(p.service_zone_id ?? "");
    setPropServiceZoneName(p.service_zone_name_bg || p.service_zone_name_en || "");
    setPropLat(p.latitude ? parseFloat(p.latitude) : null);
    setPropLng(p.longitude ? parseFloat(p.longitude) : null);
    setPropDescription(p.description ?? "");
    setPropBedrooms(p.bedrooms != null ? String(p.bedrooms) : "");
    setPropSqm(p.square_meters != null ? String(p.square_meters) : "");
    setPropDuration(String(p.default_cleaning_duration_minutes));
    setPropPrice(p.default_price_eur ?? "");
    setExistingImages(p.images ?? []);
    setNewImageFiles([]); setNewImagePreviews([]);
    setDeletingImageIds(new Set());
    setPropError("");
    setShowPropForm(true);
  }

  function closePropForm() {
    setShowPropForm(false);
    // Revoke object URLs to avoid memory leaks
    newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setNewImageFiles([]); setNewImagePreviews([]);
  }

  // ── Photo file handling ────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const issue = files.map((file) => validateImageFile(file, PROPERTY_IMAGE_MAX_BYTES)).find(Boolean);
    if (issue) {
      setPropError(t(issue === "too_large" ? "propForm.photoTooLarge" : "propForm.invalidPhotoType"));
      e.currentTarget.value = "";
      return;
    }
    setPropError("");
    const previews = files.map((f) => URL.createObjectURL(f));
    setNewImageFiles((prev) => [...prev, ...files]);
    setNewImagePreviews((prev) => [...prev, ...previews]);
    // Reset input so same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function removeNewImage(idx: number) {
    URL.revokeObjectURL(newImagePreviews[idx]);
    setNewImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function deleteExistingImage(imgId: number) {
    setDeletingImageIds((prev) => new Set(prev).add(imgId));
    const res = await apiFetch(`/api/properties/images/${imgId}/`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setExistingImages((prev) => prev.filter((img) => img.id !== imgId));
      // Also update the property in the main list
      setProperties((prev) =>
        prev.map((p) =>
          p.id === editingPropId
            ? { ...p, images: p.images.filter((img) => img.id !== imgId) }
            : p,
        ),
      );
    }
    setDeletingImageIds((prev) => {
      const next = new Set(prev);
      next.delete(imgId);
      return next;
    });
  }

  async function uploadNewImages(propertyId: number) {
    for (let i = 0; i < newImageFiles.length; i++) {
      const formData = new FormData();
      formData.append("property_id", String(propertyId));
      formData.append("image", newImageFiles[i]);
      formData.append("order", String(existingImages.length + i));
      const res = await apiFetch("/api/properties/images/", { method: "POST", body: formData });
      if (res.ok) {
        const newImg = await res.json() as PropertyImage;
        setProperties((prev) =>
          prev.map((p) =>
            p.id === propertyId ? { ...p, images: [...p.images, newImg] } : p,
          ),
        );
      }
    }
  }

  // ── Save property (create or update) ──────────────────────────────────────
  async function submitProperty(e: FormEvent) {
    e.preventDefault();
    if (propCity === "Sofia" && !propServiceZoneId) {
      setPropError(t("propForm.serviceZoneRequired"));
      return;
    }
    // Validate client-side before any request — size must be whole/half m².
    const sqmErrMsg = sqmErr(propSqm);
    if (sqmErrMsg) {
      setPropError(sqmErrMsg);
      return;
    }
    setPropError("");
    setSavingProp(true);
    try {
      const payload = {
        name: propName,
        city: propCity,
        address: propAddress,
        neighborhood: propNeighborhood,
        service_zone_id: propCity === "Sofia" ? propServiceZoneId : null,
        latitude: propLat !== null ? parseFloat(propLat.toFixed(6)) : null,
        longitude: propLng !== null ? parseFloat(propLng.toFixed(6)) : null,
        description: propDescription,
        bedrooms: propBedrooms ? parseInt(propBedrooms) : null,
        square_meters: propSqm || null,
        default_cleaning_duration_minutes: parseInt(propDuration) || 120,
        default_price_eur: propPrice || null,
      };

      let res: Response;
      if (editingPropId !== null) {
        res = await apiFetch(`/api/properties/properties/${editingPropId}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch("/api/properties/properties/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const msgs = Object.values(data).flat().join(" ");
        setPropError(msgs || t("errors.saveProp"));
        return;
      }

      const savedProp = await res.json() as Property;

      if (editingPropId !== null) {
        setProperties((prev) => prev.map((p) => (p.id === savedProp.id ? { ...p, ...savedProp } : p)));
      } else {
        setProperties((prev) => [...prev, { ...savedProp, images: [] }]);
      }

      // Upload any new photos
      if (newImageFiles.length > 0) {
        await uploadNewImages(savedProp.id);
      }

      closePropForm();
    } finally {
      setSavingProp(false);
    }
  }

  // ── Create job ─────────────────────────────────────────────────────────────
  function openJobForm(day?: number, jobToEdit?: CleaningJob, presetPropId?: number) {
    if (shouldSuppressModalOpen()) return;
    setEditingJobId(jobToEdit?.id ?? null);
    if (jobToEdit) {
      setJobPropId(String(jobToEdit.property));
      setJobTitle(jobToEdit.title);
      setJobPrice(jobToEdit.proposed_price ?? "");
      setJobDesc(jobToEdit.description ?? "");
      const start = new Date(jobToEdit.scheduled_start);
      const end   = new Date(jobToEdit.scheduled_end);
      setJobDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
      setJobStartTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      setJobEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
    } else {
      setJobPropId(
        presetPropId != null
          ? String(presetPropId)
          : properties.length === 1 ? String(properties[0].id) : "",
      );
      setJobTitle("");
      setJobPrice("");
      setJobDesc("");
      if (day !== undefined) {
        setJobDate(`${calYear}-${pad(calMonth + 1)}-${pad(day)}`);
      } else if (selectedDay !== null) {
        // "Post a job" with a calendar day selected → use that day's date.
        setJobDate(`${calYear}-${pad(calMonth + 1)}-${pad(selectedDay)}`);
      } else {
        // Nothing selected → default to today.
        const today = new Date();
        setJobDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
      }
      setJobStartTime("10:00");
      setJobEndTime("12:00");
    }
    setJobError("");
    setShowJobForm(true);
  }

  async function submitJob(e: FormEvent) {
    e.preventDefault();
    setJobError("");
    setSavingJob(true);
    try {
      const payload = {
        property_id: parseInt(jobPropId),
        title: jobTitle,
        scheduled_start: new Date(`${jobDate}T${jobStartTime}`).toISOString(),
        scheduled_end:   new Date(`${jobDate}T${jobEndTime}`).toISOString(),
        proposed_price: jobPrice || null,
        description: jobDesc,
      };
      const isEdit = editingJobId !== null;
      const res = await apiFetch(
        isEdit ? `/api/marketplace/jobs/${editingJobId}/` : "/api/marketplace/jobs/",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const msgs = Object.values(data).flat().join(" ");
        setJobError(msgs || t("errors.saveJob"));
        return;
      }
      const savedJob = await res.json() as CleaningJob;
      if (isEdit) {
        setAllJobs((prev) =>
          prev.map((j) => j.id === savedJob.id ? savedJob : j)
              .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
        );
      } else {
        setAllJobs((prev) =>
          [...prev, savedJob].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
        );
      }
      setEditingJobId(null);
      setJobPropId(""); setJobTitle(""); setJobDate(""); setJobStartTime("10:00"); setJobEndTime("12:00"); setJobPrice(""); setJobDesc("");
      setShowJobForm(false);
    } finally {
      setSavingJob(false);
    }
  }

  // ── Publish job ────────────────────────────────────────────────────────────
  async function publishJob(id: number) {
    const res = await apiFetch(`/api/marketplace/jobs/${id}/publish/`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json() as CleaningJob;
      setAllJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    }
  }

  // ── Accept / reject application ────────────────────────────────────────────
  async function acceptApplication(appId: number) {
    setActingAppId(appId);
    try {
      const res = await apiFetch(`/api/marketplace/applications/${appId}/accept/`, { method: "POST" });
      if (!res.ok) return;
      const newAssignment = await res.json() as HostAssignment;
      // Remove the accepted application (and all others for the same job are rejected by the service)
      const acceptedApp = applications.find((a) => a.id === appId);
      if (acceptedApp) {
        setAllApplications((prev) =>
          prev.filter((a) => a.job !== acceptedApp.job),
        );
        // Update the job status in the jobs list
        setAllJobs((prev) =>
          prev.map((j) => j.id === acceptedApp.job ? { ...j, status: "assigned" as JobStatus } : j),
        );
      }
      setAllAssignments((prev) => [...prev, newAssignment]);
    } finally {
      setActingAppId(null);
    }
  }

  async function rejectApplication(appId: number) {
    setActingAppId(appId);
    try {
      const res = await apiFetch(`/api/marketplace/applications/${appId}/reject/`, { method: "POST" });
      if (!res.ok) return;
      setAllApplications((prev) => prev.filter((a) => a.id !== appId));
    } finally {
      setActingAppId(null);
    }
  }

  // ── Submit review ───────────────────────────────────────────────────────────
  // ── Reviews ──────────────────────────────────────────────────────────────
  // The cleaner marks a job done (no host completion step); the host then
  // reviews the cleaner through the review window (ReviewModal).
  function openReview(asgn: HostAssignment) {
    if (shouldSuppressModalOpen()) return;
    setReviewTarget({
      jobId: asgn.job,
      jobTitle: asgn.job_title,
      revieweeId: asgn.cleaner,
      revieweeName: asgn.cleaner_name,
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

  // ── ICS import handlers ────────────────────────────────────────────────────
  function openIcsModal() {
    if (shouldSuppressModalOpen()) return;
    setIcsStep(1);
    setIcsPropId(properties.length === 1 ? String(properties[0].id) : "");
    setIcsFile(null);
    setIcsEvents([]);
    setIcsSelected(new Set());
    setIcsStartTime("10:00");
    setIcsError("");
    setIcsImportDone(null);
    setShowIcsModal(true);
  }

  async function parseIcs() {
    setIcsParsing(true);
    setIcsError("");
    try {
      if (!icsFile) { setIcsError(t("icsModal.errorNoFile")); return; }
      const formData = new FormData();
      formData.append("ics_file", icsFile);
      const res = await apiFetch("/api/properties/parse-ics/", { method: "POST", body: formData });
      const data = await res.json() as IcsEvent[] | { detail: string };
      if (!res.ok) {
        setIcsError((data as { detail: string }).detail ?? t("icsModal.errorParseFailed"));
        return;
      }
      const events = data as IcsEvent[];
      if (events.length === 0) {
        setIcsError(t("icsModal.errorNoReservations"));
        return;
      }
      setIcsEvents(events);
      setIcsSelected(new Set(events.map((e) => e.uid)));
      setIcsStep(2);
    } finally {
      setIcsParsing(false);
    }
  }

  function handleIcsFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setIcsFile(null);
      return;
    }
    const issue = validateIcsFile(file);
    if (issue) {
      setIcsFile(null);
      setIcsError(t(issue === "too_large" ? "icsModal.errorFileTooLarge" : "icsModal.errorInvalidFile"));
      e.currentTarget.value = "";
      return;
    }
    setIcsError("");
    setIcsFile(file);
  }

  async function importIcsJobs() {
    if (!icsPropId) { setIcsError(t("icsModal.errorNoProp")); return; }
    const toCreate = icsEvents.filter((e) => icsSelected.has(e.uid));
    if (toCreate.length === 0) { setIcsError(t("icsModal.errorNoEvents")); return; }

    const prop = properties.find((p) => p.id === parseInt(icsPropId));
    const durationMs = (prop?.default_cleaning_duration_minutes ?? 120) * 60 * 1000;

    setIcsImporting(true);
    setIcsError("");
    let created = 0;
    let skipped = 0;

    for (const ev of toCreate) {
      const startDate = new Date(`${ev.checkout}T${icsStartTime}:00`);
      const endDate   = new Date(startDate.getTime() + durationMs);
      const res = await apiFetch("/api/marketplace/jobs/", {
        method: "POST",
        body: JSON.stringify({
          property_id: parseInt(icsPropId),
          title: `Checkout cleaning – ${ev.summary}`,
          scheduled_start: startDate.toISOString(),
          scheduled_end:   endDate.toISOString(),
          description: `Imported from Airbnb calendar.\nCheckout: ${ev.checkout}  |  Check-in was: ${ev.checkin} (${ev.nights} night${ev.nights !== 1 ? "s" : ""})`,
        }),
      });
      if (res.ok) {
        const newJob = await res.json() as CleaningJob;
        setAllJobs((prev) => [...prev, newJob].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)));
        created++;
      } else {
        skipped++;
      }
    }
    setIcsImportDone({ created, skipped });
    setIcsImporting(false);
  }

  function toggleIcsEvent(uid: string) {
    setIcsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function logout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    window.location.href = "/";
  }

  function openAccountFromMenu() {
    setAccountMenuOpen(false);
    setSection("account");
  }

  async function changePreferredLanguage(preferredLanguage: "bg" | "en") {
    if (!me) return;
    const response = await apiFetch(`/api/accounts/users/${me.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ preferred_language: preferredLanguage }),
    });
    if (!response.ok) return;
    const updatedUser = (await response.json()) as CurrentUser;
    setMe(updatedUser);
    setAccountLanguage(updatedUser.preferred_language);
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    setAccountError("");
    setSavingAccount(true);
    try {
      const userRes = await apiFetch(`/api/accounts/users/${me.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: accountFirstName,
          last_name: accountLastName,
          phone_number: accountPhone,
          preferred_language: accountLanguage,
        }),
      });
      if (!userRes.ok) {
        setAccountError(t("errors.saveAccount"));
        return;
      }
      if (hostProfileId != null) {
        const hpRes = await apiFetch(`/api/accounts/hosts/${hostProfileId}/`, {
          method: "PATCH",
          body: JSON.stringify({
            company_name: accountCompany,
            city: accountCity,
            notes: accountNotes,
          }),
        });
        if (!hpRes.ok) {
          setAccountError(t("errors.saveHostProfile"));
          return;
        }
      }
      const meRes = await apiFetch("/api/accounts/me/");
      if (meRes.ok) setMe((await meRes.json()) as CurrentUser);
      setAccountSaved(true);
    } finally {
      setSavingAccount(false);
    }
  }

  // ── Calendar computed ──────────────────────────────────────────────────────
  const blanks   = firstWeekday(calYear, calMonth);
  const totalDays = daysInMonth(calYear, calMonth);
  const monthPrefix = `${calYear}-${pad(calMonth + 1)}-`;

  const jobsByDay = useMemo(() => {
    const map = new Map<number, CleaningJob[]>();
    for (const job of jobs) {
      const ds = dateOnly(job.scheduled_start);
      if (ds.startsWith(monthPrefix)) {
        const day = parseInt(ds.slice(8), 10);
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(job);
      }
    }
    return map;
  }, [jobs, monthPrefix]);

  const visibleJobs = useMemo(() => {
    if (selectedDay !== null) {
      const target = `${monthPrefix}${pad(selectedDay)}`;
      return jobs.filter((j) => dateOnly(j.scheduled_start) === target);
    }
    const start = new Date(calYear, calMonth, 1).toISOString();
    const end   = new Date(calYear, calMonth + 1, 1).toISOString();
    return jobs.filter((j) => j.scheduled_start >= start && j.scheduled_start < end);
  }, [jobs, selectedDay, calYear, calMonth, monthPrefix]);

  /** Per-job activity summary: pending application count + assignment (if any). */
  const jobActivityMap = useMemo(() => {
    const map = new Map<number, { pendingApps: number; assignment: HostAssignment | null }>();
    for (const app of applications) {
      if (!map.has(app.job)) map.set(app.job, { pendingApps: 0, assignment: null });
      if (app.status === "pending") map.get(app.job)!.pendingApps++;
    }
    for (const asgn of assignments) {
      if (!map.has(asgn.job)) map.set(asgn.job, { pendingApps: 0, assignment: null });
      map.get(asgn.job)!.assignment = asgn;
    }
    return map;
  }, [applications, assignments]);

  function prevMonth() {
    setSelectedDay(null);
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  /** One calendar day cell. */
  function renderCalCell(day: number) {
    const dayJobs = jobsByDay.get(day) ?? [];
    const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
    const isSelected = day === selectedDay;
    return (
      <button
        key={day}
        type="button"
        className={`host-cal-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
        onClick={() => {
          if (isSelected) { setSelectedDay(null); return; }
          setSelectedDay(day);
          // If empty day clicked, pre-fill job form with that date
          if (dayJobs.length === 0) {
            setJobError(""); openJobForm(day, undefined, selectedPropertyId ?? undefined);
          }
        }}
        title={dayJobs.length > 0 ? `${dayJobs.length} job(s)` : "Click to post a job"}
      >
        <span className="host-cal-day-num">{day}</span>
        <div className="host-cal-thumbs">
          {dayJobs.slice(0, 3).map((j) => {
            const propThumb = getPropThumb(j.property);
            const activity = jobActivityMap.get(j.id);
            const assignment = activity?.assignment ?? null;
            const hasPendingApps = (activity?.pendingApps ?? 0) > 0;
            const cleanerImg = assignment?.cleaner_profile_image || null;
            const cleanerInitial = assignment?.cleaner_name?.charAt(0).toUpperCase() ?? "";
            return (
              <span
                key={j.id}
                className="host-cal-thumb"
                style={{ boxShadow: `inset 0 0 0 1.5px ${STATUS_COLOR[j.status]}` }}
              >
                {propThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={propThumb} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="host-cal-thumb--icon">
                    <Building2 size={15} aria-hidden />
                  </span>
                )}
                {hasPendingApps && (
                  <span
                    className="host-cal-thumb-pending"
                    aria-hidden
                    title={`${activity?.pendingApps} pending application${activity?.pendingApps !== 1 ? "s" : ""}`}
                  />
                )}
                {assignment && (
                  <span className="host-cal-thumb-avatar" aria-hidden>
                    {cleanerImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cleanerImg} alt="" loading="lazy" decoding="async" />
                    ) : (
                      cleanerInitial
                    )}
                  </span>
                )}
              </span>
            );
          })}
          {dayJobs.length > 3 && (
            <span className="host-cal-thumb-more">+{dayJobs.length - 3}</span>
          )}
        </div>
      </button>
    );
  }

  function getPropName(id: number) {
    return properties.find((p) => p.id === id)?.name ?? `Property #${id}`;
  }

  /** First photo of a property, or null when it has none (icon fallback). */
  function getPropThumb(id: number): string | null {
    return properties.find((p) => p.id === id)?.images?.[0]?.content_url ?? null;
  }

  /** Reviews where this host is the reviewee (written by cleaners about the host). */
  const hostReviews = useMemo(
    () => reviews.filter((r) => r.reviewee === (me?.id ?? -1)),
    [reviews, me],
  );
  const hostRatingAvg = useMemo(() => {
    if (hostReviews.length === 0) return null;
    return hostReviews.reduce((sum, r) => sum + r.rating, 0) / hostReviews.length;
  }, [hostReviews]);

  /** Total spent = sum of agreed_price across fully-completed assignments. */
  const completedAssignments = useMemo(
    () => assignments.filter((a) => a.completed_at),
    [assignments],
  );
  const totalSpent = useMemo(
    () => completedAssignments.reduce((sum, a) => sum + Number(a.agreed_price ?? 0), 0),
    [completedAssignments],
  );

  // A review notification (?reviewJob=) opens the review window for that job.
  useEffect(() => {
    if (!requestedReviewJobId || Number.isNaN(requestedReviewJobId)) return;
    if (autoOpenedReviewJobIdRef.current === requestedReviewJobId) return;
    const asgn = allAssignments.find((a) => a.job === requestedReviewJobId && a.completed_at);
    if (!asgn) return;
    autoOpenedReviewJobIdRef.current = requestedReviewJobId;
    setSection("applications");
    setReviewTarget({
      jobId: asgn.job,
      jobTitle: asgn.job_title,
      revieweeId: asgn.cleaner,
      revieweeName: asgn.cleaner_name,
    });
  }, [requestedReviewJobId, allAssignments]);

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (loadingMe) {
    return <main className="host-page"><p className="host-loading">{t("gates.loading")}</p></main>;
  }
  if (!me) {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.notLoggedIn.eyebrow")}</p>
          <h1>{t("gates.notLoggedIn.heading")}</h1>
          <Link className="primary-link" href="/login">{t("gates.notLoggedIn.link")}</Link>
        </section>
      </main>
    );
  }
  if (me.role !== "host") {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.wrongRole.eyebrow")}</p>
          <h1>{t("gates.wrongRole.heading")}</h1>
          <p>{t("gates.wrongRole.body")}</p>
          <Link className="secondary-link" href="/app">{t("gates.wrongRole.link")}</Link>
        </section>
      </main>
    );
  }

  const isApproved = me.is_approved;
  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const displayName = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || me.email.split("@")[0];

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Top bar ── */}
      <header className="host-topbar">
        <Link className="site-brand" href="/">
          <span className="brand-symbol"><HomeIcon size={18} aria-hidden /></span>
          <strong>{tNav("brandName")}</strong>
        </Link>

        <nav className="host-section-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={`host-tab${section === "jobs" ? " active" : ""}`}
            onClick={() => setSection("jobs")}
          >
            <CalendarDays size={15} aria-hidden />
            {t("topbar.jobsTab")}
          </button>
          <button
            type="button"
            className={`host-tab${section === "applications" ? " active" : ""}`}
            onClick={() => setSection("applications")}
          >
            <ClipboardList size={15} aria-hidden />
            {t("topbar.applicationsTab")}
            {pendingCount > 0 && (
              <span className="host-tab-count host-tab-count--alert">{pendingCount}</span>
            )}
          </button>
          <Connections meId={me.id} />
        </nav>

        <div className="host-topbar-right">
          <Link className="text-link" href="/cleaners">
            <Users size={15} aria-hidden />
            {t("topbar.findCleaners")}
          </Link>
          <NotificationBell />
          <div className="cleaner-account-menu" ref={accountMenuRef}>
            <button
              className="cleaner-account-menu-trigger"
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={t("topbar.accountMenuAriaLabel")}
            >
              <User size={18} aria-hidden />
            </button>
            {accountMenuOpen && (
              <div className="cleaner-account-menu-dropdown" role="menu" aria-label={t("topbar.accountMenuAriaLabel")}>
                <div className="cleaner-account-menu-identity">
                  <strong>{displayName}</strong>
                  <span>{t("topbar.role")}</span>
                </div>
                <button type="button" className="cleaner-account-menu-item" role="menuitem" onClick={openAccountFromMenu}>
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
                <button
                  type="button"
                  className="cleaner-account-menu-item cleaner-account-menu-item--danger"
                  role="menuitem"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} aria-hidden />
                  {t("topbar.logOut")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="host-page">
       <div className="host-workspace">
        {/* ── Property navigation rail (desktop) ── */}
        {isApproved && section !== "account" && (
          <aside
            className={`host-rail${railExpanded ? " host-rail--expanded" : " host-rail--mini"}`}
            aria-label={t("rail.ariaLabel")}
          >
            <div className="host-rail-head">
              <button
                type="button"
                className="host-rail-toggle"
                onClick={toggleRail}
                title={railExpanded ? t("rail.collapseAriaLabel") : t("rail.expandAriaLabel")}
                aria-label={railExpanded ? t("rail.collapseAriaLabel") : t("rail.expandAriaLabel")}
              >
                {railExpanded ? <ChevronLeft size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
              </button>
            </div>

            <button
              type="button"
              className={`host-rail-card host-rail-card--btn${selectedPropertyId == null ? " host-rail-card--active" : ""}`}
              onClick={() => setSelectedPropertyId(null)}
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
              {properties.map((p) => {
                const railThumb = p.images?.[0]?.content_url ?? null;
                const active = selectedPropertyId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`host-rail-card${active ? " host-rail-card--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="host-rail-card-main"
                      onClick={() => setSelectedPropertyId(p.id)}
                      title={p.name}
                      aria-label={p.name}
                    >
                      <span className="host-rail-thumb">
                        {railThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={railThumb} alt="" />
                        ) : (
                          <span className="host-rail-thumb--empty"><Building2 size={22} aria-hidden /></span>
                        )}
                      </span>
                      <span className="host-rail-card-text host-rail-fade">
                        <span className="host-rail-card-name">{p.name}</span>
                        {p.city && <span className="host-rail-card-city">{p.city}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="host-rail-card-edit host-rail-fade"
                      onClick={() => openEditProp(p)}
                      title={`Edit ${p.name}`}
                      aria-label={`Edit ${p.name}`}
                      tabIndex={railExpanded ? 0 : -1}
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="host-rail-card host-rail-card--btn host-rail-card--add"
              onClick={openCreateProp}
              title={t("rail.addProperty")}
              aria-label={t("rail.addProperty")}
            >
              <span className="host-rail-thumb host-rail-thumb--icon host-rail-thumb--add">
                <Plus size={22} aria-hidden />
              </span>
              <span className="host-rail-card-text host-rail-fade">
                <span className="host-rail-card-name">{t("rail.addProperty")}</span>
              </span>
            </button>
          </aside>
        )}

        <div className="host-workspace-main">
        {/* ── Property selector (mobile — rail collapses to a dropdown) ── */}
        {isApproved && section !== "account" && (
          <div className="host-rail-mobile">
            <select
              className="host-rail-mobile-select"
              value={selectedPropertyId ?? ""}
              onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
              aria-label={t("rail.filterAriaLabel")}
            >
              <option value="">{t("rail.allProperties")}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" className="host-rail-mobile-add" onClick={openCreateProp}>
              <Plus size={15} aria-hidden /> {t("rail.addShort")}
            </button>
          </div>
        )}

        {/* ── Pending banner ── */}
        {!isApproved && (
          <div className="host-pending-banner">
            ⏳ {t("pendingBanner", { status: me.account_status })}
          </div>
        )}
        <VerificationStatusSummary user={me} compact />
        {dataError && <p className="form-error" style={{ margin: "16px 24px 0" }}>{dataError}</p>}

        {/* ══ APPLICATIONS SECTION ══ */}
        {section === "applications" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("apps.eyebrow")}</p>
                <h1 className="host-section-title">{t("apps.title")}</h1>
              </div>
              {!loadingData && (
                <button
                  type="button"
                  className="secondary-link host-appdash-edit-btn"
                  onClick={() => appdash.setEditing(!appdash.editing)}
                >
                  {appdash.editing ? t("apps.doneEditing") : t("apps.editCards")}
                </button>
              )}
            </div>

            {/* ── Summary dashboard ── */}
            {!loadingData && (
              <AppdashGrid
                appFilter={appFilter}
                setAppFilter={setAppFilter}
                pending={pendingCount}
                active={assignments.filter((a) => !a.completed_at).length}
                completed={completedAssignments.length}
                open={jobs.filter((j) => j.status === "open").length}
                openSub={t("apps.openSub")}
                rating={hostRatingAvg}
                ratingCount={hostReviews.length}
                moneyLabel={t("apps.moneyLabel")}
                moneyValue={formatMoney(totalSpent)}
                moneyCount={completedAssignments.length}
                cards={appdash.cards}
                editing={appdash.editing}
                onMove={appdash.moveCard}
                onToggle={appdash.toggleCard}
              />
            )}

            {/* ── My cleaners (saved / favourites) ── */}
            {!loadingData && favourites.length > 0 && (
              <div className="host-apps-subsection host-mycleaners">
                <h2 className="host-apps-subtitle">
                  <Heart size={15} aria-hidden fill="currentColor" /> {t("apps.myCleaners")}
                </h2>
                <div className="host-mycleaners-grid">
                  {favourites.map((fav) => (
                    <div key={fav.id} className="host-mycleaner-card">
                      <div className="host-mycleaner-avatar">
                        {fav.profile_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fav.profile_image} alt="" />
                        ) : (
                          <span>{fav.cleaner_name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="host-mycleaner-main">
                        <span className="host-mycleaner-name">{fav.cleaner_name}</span>
                        <RatingStars
                          rating={fav.average_rating ?? 0}
                          count={fav.completed_jobs_count}
                          size={12}
                        />
                        {fav.service_areas.length > 0 && (
                          <span className="host-mycleaner-areas">{fav.service_areas.slice(0, 2).join(" · ")}</span>
                        )}
                      </div>
                      <div className="host-mycleaner-actions">
                        {fav.cleaner_profile_id && (
                          <button
                            type="button"
                            className="host-app-view-profile"
                            onClick={() => {
                              if (shouldSuppressModalOpen()) return;
                              setViewProfileId(fav.cleaner_profile_id);
                            }}
                          >
                            {t("apps.view")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="host-offer-trigger"
                          onClick={() => {
                            if (shouldSuppressModalOpen()) return;
                            setOfferTarget({ userId: fav.cleaner, name: fav.cleaner_name });
                          }}
                        >
                          <Send size={12} aria-hidden /> {t("apps.offer")}
                        </button>
                        <button
                          type="button"
                          className="host-fav-toggle host-fav-toggle--on"
                          aria-label="Remove from saved cleaners"
                          onClick={() => void toggleFavourite(fav.cleaner)}
                        >
                          <Heart size={12} aria-hidden fill="currentColor" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingData ? (
              <p className="host-empty">{t("apps.loading")}</p>
            ) : (
              <>
                {/* ── Pending applications ── */}
                {(appFilter === null || appFilter === "pending") && (
                <div className="host-apps-subsection">
                  <h2 className="host-apps-subtitle">
                    {t("apps.pending.title")}
                    {pendingCount > 0 && (
                      <span className="host-apps-subtitle-count">{pendingCount}</span>
                    )}
                  </h2>

                  {applications.filter((a) => a.status === "pending").length === 0 ? (
                    <div className="host-apps-empty">
                      <ClipboardList size={32} />
                      <p>{t("apps.pending.empty")}</p>
                      <span className="host-apps-empty-hint">
                        {t("apps.pending.emptyHint")}
                      </span>
                    </div>
                  ) : (
                    <ul className="host-apps-list">
                      {applications
                        .filter((a) => a.status === "pending")
                        .sort((a, b) => a.job_scheduled_start.localeCompare(b.job_scheduled_start))
                        .map((app) => (
                          <li key={app.id} className="host-app-card">
                            <div className="host-app-card-left">
                              <div className="host-app-job-info">
                                <strong className="host-app-job-title">{app.job_title}</strong>
                                <span className="host-app-job-meta">
                                  {app.job_property_name}
                                  {app.job_property_city && ` · ${app.job_property_city}`}
                                  {app.job_property_neighborhood && ` · ${app.job_property_neighborhood}`}
                                </span>
                                <span className="host-app-job-time">
                                  {fmtDateTime(app.job_scheduled_start)} – {fmtTime(app.job_scheduled_end)}
                                </span>
                              </div>

                              <div className="host-app-divider" />

                              <div className="host-app-cleaner-info">
                                <span className="host-app-cleaner-name">{app.cleaner_name}</span>
                                <a
                                  href={`mailto:${app.cleaner_email}`}
                                  className="host-app-cleaner-email"
                                >
                                  {app.cleaner_email}
                                </a>
                                {app.cleaner_profile_id && (
                                  <button
                                    type="button"
                                    className="host-app-view-profile"
                                    onClick={() => {
                                      if (shouldSuppressModalOpen()) return;
                                      setViewProfileId(app.cleaner_profile_id);
                                    }}
                                  >
                                    {t("apps.pending.viewProfile")}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`host-fav-toggle${isFavourited(app.cleaner) ? " host-fav-toggle--on" : ""}`}
                                  aria-pressed={isFavourited(app.cleaner)}
                                  aria-label={isFavourited(app.cleaner) ? t("apps.pending.saved") : t("apps.pending.save")}
                                  onClick={() => void toggleFavourite(app.cleaner)}
                                >
                                  <Heart size={13} aria-hidden fill={isFavourited(app.cleaner) ? "currentColor" : "none"} />
                                  {isFavourited(app.cleaner) ? t("apps.pending.saved") : t("apps.pending.save")}
                                </button>
                                <button
                                  type="button"
                                  className="host-offer-trigger"
                                  onClick={() => {
                                    if (shouldSuppressModalOpen()) return;
                                    setOfferTarget({ userId: app.cleaner, name: app.cleaner_name });
                                  }}
                                >
                                  <Send size={13} aria-hidden /> {t("apps.pending.offerJob")}
                                </button>
                              </div>

                              {app.message && (
                                <p className="host-app-message">&quot;{app.message}&quot;</p>
                              )}
                            </div>

                            <div className="host-app-card-right">
                              {app.proposed_price ? (
                                <span className="host-app-price">€{app.proposed_price}</span>
                              ) : app.job_proposed_price ? (
                                <span className="host-app-price host-app-price--job">
                                  €{app.job_proposed_price}
                                  <small>{t("apps.pending.listed")}</small>
                                </span>
                              ) : null}

                              <div className="host-app-actions">
                                {app.origin === "host_offered" ? (
                                  // The host sent this offer — only the cleaner can accept it,
                                  // so there's no Accept button here, just a withdraw option.
                                  <span className="host-app-badge host-app-badge--offer">
                                    {t("apps.pending.offerSent")}
                                  </span>
                                ) : (
                                  <button
                                    className="host-app-accept-btn"
                                    type="button"
                                    disabled={actingAppId === app.id}
                                    onClick={() => void acceptApplication(app.id)}
                                  >
                                    <Check size={13} aria-hidden />
                                    {actingAppId === app.id ? "…" : t("apps.pending.accept")}
                                  </button>
                                )}
                                <button
                                  className="host-app-reject-btn"
                                  type="button"
                                  disabled={actingAppId === app.id}
                                  onClick={() => void rejectApplication(app.id)}
                                >
                                  <X size={13} aria-hidden />
                                  {app.origin === "host_offered" ? t("apps.pending.withdraw") : t("apps.pending.decline")}
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                )}

                {/* ── Active assignments ── */}
                {(appFilter === null || appFilter === "active") && (
                <div className="host-apps-subsection">
                  <h2 className="host-apps-subtitle">{t("apps.active.title")}</h2>

                  {assignments.filter((a) => !a.completed_at).length === 0 ? (
                    <div className="host-apps-empty">
                      <Check size={32} />
                      <p>{t("apps.active.empty")}</p>
                      <span className="host-apps-empty-hint">
                        {t("apps.active.emptyHint")}
                      </span>
                    </div>
                  ) : (
                    <ul className="host-apps-list">
                      {assignments
                        .filter((a) => !a.completed_at)
                        .sort((a, b) => a.job_scheduled_start.localeCompare(b.job_scheduled_start))
                        .map((asgn) => {
                          return (
                          <li key={asgn.id} className="host-app-card host-app-card--assigned">
                            <div className="host-app-card-left">
                              <div className="host-app-job-info">
                                <strong className="host-app-job-title">{asgn.job_title}</strong>
                                <span className="host-app-job-meta">
                                  {asgn.job_property_name}
                                  {asgn.job_property_city && ` · ${asgn.job_property_city}`}
                                </span>
                                <span className="host-app-job-time">
                                  {fmtDateTime(asgn.job_scheduled_start)} – {fmtTime(asgn.job_scheduled_end)}
                                </span>
                              </div>

                              <div className="host-app-divider" />

                              <div className="host-app-cleaner-info">
                                <span className="host-app-cleaner-name">{asgn.cleaner_name}</span>
                                <a
                                  href={`mailto:${asgn.cleaner_email}`}
                                  className="host-app-cleaner-email"
                                >
                                  {asgn.cleaner_email}
                                </a>
                              </div>
                            </div>

                            <div className="host-app-card-right">
                              {asgn.agreed_price && (
                                <span className="host-app-price">€{asgn.agreed_price}</span>
                              )}
                              <span className="host-app-badge host-app-badge--assigned">{t("apps.active.badge")}</span>
                            </div>
                          </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
                )}

                {/* ── Recently completed ── */}
                {(appFilter === "completed" || (appFilter === null && assignments.filter((a) => a.completed_at).length > 0)) && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle host-apps-subtitle--muted">{t("apps.completed.title")}</h2>
                    {assignments.filter((a) => a.completed_at).length === 0 ? (
                      <div className="host-apps-empty">
                        <Check size={32} />
                        <p>{t("apps.completed.empty")}</p>
                      </div>
                    ) : (
                    <ul className="host-apps-list">
                      {assignments
                        .filter((a) => a.completed_at)
                        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
                        .slice(0, 10)
                        .map((asgn) => (
                          <li key={asgn.id} className="host-app-card host-app-card--done">
                            <div className="host-app-card-left">
                              <div className="host-app-job-info">
                                <strong className="host-app-job-title">{asgn.job_title}</strong>
                                <span className="host-app-job-meta">
                                  {asgn.job_property_name} · {asgn.job_property_city}
                                </span>
                                <span className="host-app-job-time">
                                  {fmtDateTime(asgn.job_scheduled_start)}
                                </span>
                              </div>
                              <div className="host-app-divider" />
                              <div className="host-app-cleaner-info">
                                <span className="host-app-cleaner-name">{asgn.cleaner_name}</span>
                              </div>
                            </div>
                            <div className="host-app-card-right">
                              {asgn.agreed_price && (
                                <span className="host-app-price">€{asgn.agreed_price}</span>
                              )}
                              <span className="host-app-badge host-app-badge--done">{t("apps.completed.badge")}</span>
                            </div>
                            {/* Review row — full width */}
                            <div className="host-app-review-row">
                              {(() => {
                                const mine = reviews.find(
                                  (r) => r.job === asgn.job && r.reviewer === me.id,
                                );
                                return (
                                  <button
                                    className="host-review-trigger"
                                    type="button"
                                    onClick={() => openReview(asgn)}
                                  >
                                    ★ {mine ? t("apps.completed.viewReview") : t("apps.completed.leaveReview")}
                                  </button>
                                );
                              })()}
                            </div>
                          </li>
                        ))}
                    </ul>
                    )}
                  </div>
                )}

                {/* ── Reviews received ── */}
                {appFilter === "rating" && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">{t("apps.reviews.title")}</h2>
                    {hostReviews.length === 0 ? (
                      <p className="host-empty">{t("apps.reviews.empty")}</p>
                    ) : (
                      <ul className="host-app-list">
                        {hostReviews.map((r) => {
                          const jobTitle = jobs.find((j) => j.id === r.job)?.title ?? `Job #${r.job}`;
                          return (
                            <li id={`host-review-${r.id}`} key={r.id} className="host-app-card">
                              <div className="host-app-card-header">
                                <span className="host-app-name">{r.reviewer_name}</span>
                                <span className="host-appdash-stars">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <span key={i} className={i < r.rating ? "host-star--on" : "host-star--off"}>★</span>
                                  ))}
                                </span>
                              </div>
                              <p className="host-app-meta">{jobTitle} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                              {r.comment && <p className="host-app-message">&ldquo;{r.comment}&rdquo;</p>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* ── Open jobs listing ── */}
                {appFilter === "open" && (
                  <div className="host-apps-subsection">
                    <h2 className="host-apps-subtitle">{t("apps.openJobs.title")}</h2>
                    {jobs.filter((j) => j.status === "open").length === 0 ? (
                      <div className="host-apps-empty">
                        <CalendarDays size={32} />
                        <p>{t("apps.openJobs.empty")}</p>
                        <span className="host-apps-empty-hint">
                          {t("apps.openJobs.emptyHint")}
                        </span>
                      </div>
                    ) : (
                      <ul className="host-apps-list">
                        {jobs
                          .filter((j) => j.status === "open")
                          .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
                          .map((job) => {
                            const act = jobActivityMap.get(job.id);
                            return (
                              <li key={job.id} className="host-app-card">
                                <div className="host-app-card-left">
                                  <div className="host-app-job-info">
                                    <strong className="host-app-job-title">{job.title}</strong>
                                    <span className="host-app-job-meta">{getPropName(job.property)}</span>
                                    <span className="host-app-job-time">
                                      {fmtDateTime(job.scheduled_start)} – {fmtTime(job.scheduled_end)}
                                    </span>
                                    {act?.pendingApps ? (
                                      <span className="host-job-activity host-job-activity--apps">
                                        {t("apps.openJobs.appsCount", { count: act.pendingApps })}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="host-app-card-right">
                                  {job.proposed_price && (
                                    <span className="host-app-price">€{job.proposed_price}</span>
                                  )}
                                  <span className="host-app-badge host-app-badge--open">{t("apps.openJobs.badge")}</span>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ JOBS + CALENDAR SECTION ══ */}
        {section === "jobs" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("jobs.eyebrow")}</p>
                <h1 className="host-section-title">{t("jobs.title")}</h1>
              </div>
              {isApproved && properties.length > 0 && (
                <div className="host-section-actions">
                  <button
                    className="secondary-link"
                    type="button"
                    onClick={openIcsModal}
                  >
                    <Upload size={16} aria-hidden />
                    {t("jobs.importIcs")}
                  </button>
                  <button
                    className="primary-link"
                    type="button"
                    onClick={() => { setJobError(""); openJobForm(undefined, undefined, selectedPropertyId ?? undefined); }}
                  >
                    <Plus size={16} aria-hidden />
                    {t("jobs.postJob")}
                  </button>
                </div>
              )}
            </div>

            {!isApproved ? (
              <div className="host-empty-state">
                <CalendarDays size={40} />
                <p>{t("jobs.notApproved")}</p>
              </div>
            ) : properties.length === 0 ? (
              <div className="host-activation">
                <span className="host-activation-icon">
                  <Building2 size={26} aria-hidden />
                </span>
                <div className="host-activation-body">
                  <h2>{t("jobs.firstProp.heading")}</h2>
                  <p>{t("jobs.firstProp.body")}</p>
                </div>
                <button className="primary-link host-activation-cta" type="button" onClick={openCreateProp}>
                  <Plus size={16} aria-hidden />
                  {t("jobs.firstProp.cta")}
                </button>
              </div>
            ) : loadingData ? (
              <p className="host-empty">Loading…</p>
            ) : (
              <div className="host-jobs-layout">

                {/* ── Calendar panel ── */}
                <div className="host-calendar">
                  <div className="host-cal-nav">
                    <button type="button" className="host-cal-arrow" onClick={prevMonth} aria-label={t("jobs.cal.prevMonth")}>
                      <ChevronLeft size={16} />
                    </button>
                    <span className="host-cal-title">{MONTHS[calMonth]} {calYear}</span>
                    <button type="button" className="host-cal-arrow" onClick={nextMonth} aria-label={t("jobs.cal.nextMonth")}>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="host-cal-grid">
                    {/* Day name headers */}
                    {DAYS.map((d) => (
                      <div key={d} className="host-cal-day-header">{d}</div>
                    ))}
                    {/* Leading blank cells */}
                    {Array.from({ length: blanks }).map((_, i) => (
                      <div key={`b${i}`} className="host-cal-blank" />
                    ))}
                    {/* Day cells */}
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => renderCalCell(day))}
                  </div>
                </div>

                {/* ── Job list panel ── */}
                <div className="host-job-panel">
                  <div className="host-job-panel-header">
                    <strong>
                      {selectedDay
                        ? `${MONTHS[calMonth]} ${selectedDay}, ${calYear}`
                        : `${MONTHS[calMonth]} ${calYear}`}
                    </strong>
                    {selectedDay !== null && (
                      <button
                        className="host-clear-day"
                        type="button"
                        onClick={() => setSelectedDay(null)}
                      >
                        <X size={13} aria-hidden />
                        {t("jobs.cal.showAll")}
                      </button>
                    )}
                  </div>

                  {visibleJobs.length === 0 ? (
                    <div className="host-job-empty">
                      <p>{selectedDay ? t("jobs.cal.noJobsDay") : t("jobs.cal.noJobsMonth")}</p>
                      <button
                        className="secondary-link"
                        type="button"
                        onClick={() => { setJobError(""); openJobForm(selectedDay ?? undefined, undefined, selectedPropertyId ?? undefined); }}
                      >
                        <Plus size={14} aria-hidden />
                        {t("jobs.cal.postOne")}
                      </button>
                    </div>
                  ) : (
                    <ul className="host-job-list">
                      {visibleJobs.map((job) => (
                        <li key={job.id} className="host-job-item">
                          <span
                            className="host-job-dot"
                            style={{ background: STATUS_COLOR[job.status] }}
                          />
                          <div className="host-job-info">
                            <strong>{job.title}</strong>
                            <span className="host-job-property">{getPropName(job.property)}</span>
                            <span className="host-job-time">
                              {fmtDateTime(job.scheduled_start)}
                              {" – "}
                              {fmtTime(job.scheduled_end)}
                            </span>
                            {(() => {
                              const act = jobActivityMap.get(job.id);
                              if (!act) return null;
                              if (act.assignment?.completed_at) {
                                return <span className="host-job-activity host-job-activity--done">✓ {act.assignment.cleaner_name}</span>;
                              }
                              if (act.assignment) {
                                const completion = act.assignment.host_completed_at
                                  ? t("jobs.cal.waitingCleaner")
                                  : act.assignment.cleaner_completed_at
                                    ? t("jobs.cal.cleanerConfirmed")
                                    : t("jobs.cal.assigned");
                                return <span className="host-job-activity host-job-activity--assigned">👤 {act.assignment.cleaner_name} · {completion}</span>;
                              }
                              if (act.pendingApps > 0) {
                                const open = expandedAppsJobId === job.id;
                                return (
                                  <button
                                    type="button"
                                    className="host-job-activity host-job-activity--apps host-job-activity--btn"
                                    onClick={() => setExpandedAppsJobId(open ? null : job.id)}
                                    aria-expanded={open}
                                  >
                                    {t("apps.openJobs.appsCount", { count: act.pendingApps })}
                                    <ChevronRight size={13} aria-hidden className={open ? "host-job-apps-caret host-job-apps-caret--open" : "host-job-apps-caret"} />
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="host-job-right">
                            <div className="host-job-meta-row">
                              <span className={`host-job-badge host-job-badge--${job.status}`}>
                                {STATUS_LABEL[job.status]}
                              </span>
                              {job.proposed_price && (
                                <span className="host-job-price">€{job.proposed_price}</span>
                              )}
                            </div>
                            {(job.status === "draft" || job.status === "assigned" || job.status === "open") && (
                              <div className="host-job-actions">
                                {job.status === "draft" && (
                                  <>
                                    <button
                                      className="host-publish-btn"
                                      type="button"
                                      onClick={() => void publishJob(job.id)}
                                    >
                                      {t("jobs.publish")}
                                    </button>
                                    <button
                                      className="host-edit-btn"
                                      type="button"
                                      onClick={() => { setJobError(""); openJobForm(undefined, job); }}
                                      aria-label={t("jobs.editAriaLabel")}
                                    >
                                      <Pencil size={14} aria-hidden />
                                    </button>
                                  </>
                                )}
                                {job.available_actions?.includes("cancel") ? (
                                  <button
                                    className="host-delete-btn"
                                    type="button"
                                    onClick={() => {
                                      if (shouldSuppressModalOpen()) return;
                                      setCancelJobTarget(job);
                                    }}
                                    aria-label={t("jobs.cancelAriaLabel")}
                                  >
                                    <X size={14} aria-hidden />
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>

                          {expandedAppsJobId === job.id &&
                            applications.some((a) => a.job === job.id && a.status === "pending") && (
                            <div className="host-job-applicants">
                              {applications
                                .filter((a) => a.job === job.id && a.status === "pending")
                                .map((app) => (
                                  <div key={app.id} className="host-job-applicant">
                                    <span className="host-job-applicant-name">{app.cleaner_name}</span>
                                    <div className="host-job-applicant-actions">
                                      {app.origin === "host_offered" ? (
                                        <span className="host-app-badge host-app-badge--offer">
                                          {t("apps.pending.offerSent")}
                                        </span>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            className="host-app-accept-btn"
                                            disabled={actingAppId === app.id}
                                            onClick={() => void acceptApplication(app.id)}
                                          >
                                            <Check size={13} aria-hidden />
                                            {actingAppId === app.id ? "…" : t("apps.pending.accept")}
                                          </button>
                                          <button
                                            type="button"
                                            className="host-app-reject-btn"
                                            disabled={actingAppId === app.id}
                                            onClick={() => void rejectApplication(app.id)}
                                          >
                                            <X size={13} aria-hidden />
                                            {t("apps.pending.decline")}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ACCOUNT / PROFILE SECTION ══ */}
        {section === "account" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("account.eyebrow")}</p>
                <h1 className="host-section-title">{t("account.title")}</h1>
              </div>
            </div>

            <form className="host-form host-account-form" onSubmit={(e) => void saveAccount(e)}>
              <div className="form-grid">
                <label>
                  <span>{t("account.firstName")}</span>
                  <input value={accountFirstName} onChange={(e) => setAccountFirstName(e.target.value)} />
                </label>
                <label>
                  <span>{t("account.lastName")}</span>
                  <input value={accountLastName} onChange={(e) => setAccountLastName(e.target.value)} />
                </label>
                <label>
                  <span>{t("account.phone")}</span>
                  <input value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} placeholder="+359…" />
                </label>
                <label>
                  <span>{t("account.email")}</span>
                  <input value={me.email} readOnly disabled />
                </label>
                <label>
                  <span>{t("account.company")}</span>
                  <input value={accountCompany} onChange={(e) => setAccountCompany(e.target.value)} placeholder={t("account.companyPlaceholder")} />
                </label>
                <label>
                  <span>{t("account.city")}</span>
                  <input value={accountCity} onChange={(e) => setAccountCity(e.target.value)} placeholder={t("account.cityPlaceholder")} />
                </label>
              </div>

              <label>
                <span>{t("account.notes")}</span>
                <textarea
                  rows={3}
                  value={accountNotes}
                  onChange={(e) => setAccountNotes(e.target.value)}
                  placeholder={t("account.notesPlaceholder")}
                />
              </label>

              {accountError && <p className="form-error">{accountError}</p>}
              {accountSaved && <p className="cleaner-success">{t("account.saved")}</p>}
              <div className="host-form-actions">
                <button className="primary-link auth-submit" type="submit" disabled={savingAccount}>
                  {savingAccount ? t("common.saving") : t("account.saveChanges")}
                </button>
              </div>
            </form>
            <AccountDeletionPanel email={me.email} />
          </div>
        )}
        </div>
       </div>
      </main>

      {/* ══ PROPERTY FORM MODAL ══ */}
      {showPropForm && (
        <div
          className="host-modal-backdrop"
          onClick={closePropForm}
          role="dialog"
          aria-modal="true"
          aria-label={editingPropId !== null ? t("propForm.editTitle") : t("propForm.addTitle")}
        >
          <div className="host-modal host-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{editingPropId !== null ? t("propForm.editTitle") : t("propForm.addTitle")}</h2>
              <button type="button" className="host-modal-close" onClick={closePropForm} aria-label={t("common.close")}>
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(e) => void submitProperty(e)}>

              {/* ── Basic info ── */}
              <div className="form-grid">
                <label>
                  <span>{t("propForm.name")}</span>
                  <input
                    required
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder={t("propForm.namePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("propForm.city")}</span>
                  <select
                    required
                    value={propCity}
                    disabled={editingPropHasActiveJobs}
                    onChange={(e) => {
                      setPropCity(e.target.value);
                      setPropServiceZoneId("");
                      setPropServiceZoneName("");
                      if (editingPropId === null) { setPropLat(null); setPropLng(null); }
                    }}
                  >
                    <option value="Sofia">Sofia</option>
                    <option value="Plovdiv">Plovdiv</option>
                    <option value="Varna">Varna</option>
                  </select>
                </label>
              </div>

              {editingPropHasActiveJobs && (
                <p className="prop-address-locked-notice">
                  {t("propForm.addressLocked")}
                </p>
              )}

              {propCity === "Sofia" ? (
                <div className="prop-location-section">
                  <p className="prop-location-label">
                    {t("propForm.serviceZone")}{" "}
                    <span className="prop-location-hint">{t("propForm.serviceZoneHint")}</span>
                  </p>
                  {editingPropHasActiveJobs ? (
                    <p className="prop-address-locked-notice">
                      {propServiceZoneName || propServiceZoneId}
                    </p>
                  ) : (
                    <DistrictMapSelector
                      citySlug="sofia"
                      selectedZoneIds={propServiceZoneId ? [propServiceZoneId] : []}
                      onChange={(zoneIds) => {
                        setPropServiceZoneId(zoneIds[0] ?? "");
                        setPropServiceZoneName("");
                      }}
                      mode="single"
                    />
                  )}
                </div>
              ) : null}

              {/* ── Location map ── */}
              <div
                className="prop-location-section"
                style={editingPropHasActiveJobs ? { pointerEvents: "none", opacity: 0.5 } : undefined}
              >
                <p className="prop-location-label">{t("propForm.mapLabel")} <span className="prop-location-hint">{t("propForm.mapHint")}</span></p>
                <PropertyLocationPicker
                  lat={propLat}
                  lng={propLng}
                  city={propCity}
                  onSelect={(result: LocationResult) => {
                    setPropAddress(result.address || propAddress);
                    setPropNeighborhood(result.neighborhood || propNeighborhood);
                    setPropLat(result.lat);
                    setPropLng(result.lng);
                  }}
                />
              </div>

              <div className="form-grid">
                <label>
                  <span>{t("propForm.address")}</span>
                  <input
                    value={propAddress}
                    readOnly={editingPropHasActiveJobs}
                    onChange={(e) => !editingPropHasActiveJobs && setPropAddress(e.target.value)}
                    placeholder={t("propForm.addressPlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("propForm.neighborhood")}</span>
                  <input
                    value={propNeighborhood}
                    readOnly
                    className="prop-readonly-field"
                    placeholder={t("propForm.neighborhoodPlaceholder")}
                    title={t("propForm.neighborhoodTitle")}
                    tabIndex={-1}
                    aria-readonly="true"
                  />
                </label>
                <label>
                  <span>{t("propForm.bedrooms")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={propBedrooms}
                    onChange={(e) => setPropBedrooms(e.target.value)}
                    placeholder={t("propForm.bedroomsPlaceholder")}
                  />
                </label>
                <label className="prop-size-field">
                  <span>{t("propForm.sqm")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={propSqm}
                    onChange={(e) => setPropSqm(e.target.value)}
                    placeholder={t("propForm.sqmPlaceholder")}
                    aria-invalid={sqmErr(propSqm) ? true : undefined}
                    className={sqmErr(propSqm) ? "input-invalid" : undefined}
                  />
                  {sqmErr(propSqm) && (
                    <small className="field-error-text">{sqmErr(propSqm)}</small>
                  )}
                </label>
                <label>
                  <span>{t("propForm.duration")}</span>
                  <input
                    type="number"
                    min="30"
                    step="30"
                    value={propDuration}
                    onChange={(e) => setPropDuration(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t("propForm.price")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    placeholder={t("propForm.pricePlaceholder")}
                  />
                </label>
              </div>

              <label>
                <span>{t("propForm.description")}</span>
                <textarea
                  rows={3}
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  placeholder={t("propForm.descriptionPlaceholder")}
                />
              </label>

              {/* ── Photos ── */}
              <div className="prop-photos-section">
                <p className="prop-photos-label">{t("propForm.photos")}</p>

                {/* Existing images (edit mode) */}
                {existingImages.length > 0 && (
                  <div className="prop-photos-grid">
                    {existingImages.map((img) => (
                      <div key={img.id} className="prop-photo-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.content_url} alt={img.caption || "Property photo"} />
                        <button
                          type="button"
                          className="prop-photo-delete"
                          disabled={deletingImageIds.has(img.id)}
                          onClick={() => void deleteExistingImage(img.id)}
                          aria-label={t("propForm.removePhoto")}
                        >
                          {deletingImageIds.has(img.id) ? "…" : <Trash2 size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* New image previews */}
                {newImagePreviews.length > 0 && (
                  <div className="prop-photos-grid">
                    {newImagePreviews.map((src, idx) => (
                      <div key={idx} className="prop-photo-thumb prop-photo-thumb--new">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`New photo ${idx + 1}`} />
                        <button
                          type="button"
                          className="prop-photo-delete"
                          onClick={() => removeNewImage(idx)}
                          aria-label={t("propForm.removePhoto")}
                        >
                          <X size={13} />
                        </button>
                        <span className="prop-photo-new-badge">{t("propForm.newBadge")}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                <label className="prop-photos-upload-btn">
                  <Upload size={15} aria-hidden />
                  {t("propForm.addPhotos")}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="prop-photos-file-input"
                    onChange={handlePhotoChange}
                  />
                </label>
                <p className="prop-photos-hint">{t("propForm.photosHint")}</p>
              </div>

              {propError && <p className="form-error">{propError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={closePropForm}>
                  {t("common.cancel")}
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingProp}>
                  {savingProp
                    ? (newImageFiles.length > 0 ? t("common.uploading") : t("common.saving"))
                    : (editingPropId !== null ? t("account.saveChanges") : t("propForm.addTitle"))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ ICS IMPORT MODAL ══ */}
      {showIcsModal && (
        <div
          className="host-modal-backdrop"
          onClick={() => setShowIcsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("icsModal.ariaLabel")}
        >
          <div className="host-modal host-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>{t("icsModal.title")}</h2>
                <p className="host-modal-subtitle">
                  {icsStep === 1
                    ? t("icsModal.step1Subtitle")
                    : t("icsModal.step2Subtitle", { count: icsEvents.length })}
                </p>
              </div>
              <button type="button" className="host-modal-close" onClick={() => setShowIcsModal(false)} aria-label={t("common.close")}>
                <X size={18} />
              </button>
            </div>

            {/* ── Step 1: File upload ── */}
            {icsStep === 1 && (
              <div className="host-form">
                <label>
                  <span>{t("icsModal.propertyLabel")}</span>
                  <select
                    required
                    value={icsPropId}
                    onChange={(e) => setIcsPropId(e.target.value)}
                  >
                    <option value="">{t("icsModal.propertyPlaceholder")}</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
                    ))}
                  </select>
                </label>

                <p className="host-form-hint">{t("icsModal.urlUnavailable")}</p>
                <label className="host-ics-file-label">
                  <span>{t("icsModal.fileLabel")}</span>
                  <div className="host-ics-drop-zone">
                    <Upload size={28} className="host-ics-drop-icon" aria-hidden />
                    <span>{icsFile ? icsFile.name : t("icsModal.dropZone")}</span>
                    <input
                      type="file"
                      accept=".ics,text/calendar,application/ics,application/octet-stream"
                      className="host-ics-file-input"
                      onChange={handleIcsFileChange}
                    />
                  </div>
                </label>
                <p className="host-form-hint">{t("icsModal.fileHint")}</p>

                {icsError && <p className="form-error">{icsError}</p>}
                <div className="host-form-actions">
                  <button className="secondary-link" type="button" onClick={() => setShowIcsModal(false)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    className="primary-link auth-submit"
                    type="button"
                    disabled={icsParsing || !icsPropId || !icsFile}
                    onClick={() => void parseIcs()}
                  >
                    {icsParsing ? t("icsModal.reading") : t("icsModal.continue")}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Review events ── */}
            {icsStep === 2 && (
              <div className="host-form">
                {icsImportDone ? (
                  <div className="host-ics-done">
                    <p className="host-ics-done-count">
                      ✅ {t("icsModal.doneCreated", { count: icsImportDone.created })}
                      {icsImportDone.skipped > 0 && ` · ${t("icsModal.doneSkipped", { count: icsImportDone.skipped })}`}
                    </p>
                    <p className="host-form-hint">{t("icsModal.doneHint")}</p>
                    <div className="host-form-actions">
                      <button className="primary-link" type="button" onClick={() => setShowIcsModal(false)}>
                        {t("icsModal.done")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label>
                      <span>{t("icsModal.startTimeLabel")}</span>
                      <input
                        type="time"
                        value={icsStartTime}
                        onChange={(e) => setIcsStartTime(e.target.value)}
                        style={{ maxWidth: "140px" }}
                      />
                    </label>

                    <div className="host-ics-select-all">
                      <button
                        type="button"
                        className="host-ics-toggle-all"
                        onClick={() => setIcsSelected(
                          icsSelected.size === icsEvents.length
                            ? new Set()
                            : new Set(icsEvents.map((e) => e.uid))
                        )}
                      >
                        {icsSelected.size === icsEvents.length ? t("icsModal.deselectAll") : t("icsModal.selectAll")}
                      </button>
                      <span className="host-muted">{t("icsModal.selectedCount", { selected: icsSelected.size, total: icsEvents.length })}</span>
                    </div>

                    <ul className="host-ics-events">
                      {icsEvents.map((ev) => (
                        <li
                          key={ev.uid}
                          className={`host-ics-event${icsSelected.has(ev.uid) ? " selected" : ""}`}
                          onClick={() => toggleIcsEvent(ev.uid)}
                        >
                          <input
                            type="checkbox"
                            checked={icsSelected.has(ev.uid)}
                            onChange={() => toggleIcsEvent(ev.uid)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="host-ics-event-info">
                            <strong className="host-ics-event-summary">{ev.summary}</strong>
                            <span className="host-ics-event-dates">
                              {t("icsModal.checkin")} {ev.checkin} → {t("icsModal.checkout")} <strong>{ev.checkout}</strong>
                              <span className="host-ics-event-nights">· {t("icsModal.nights", { nights: ev.nights })}</span>
                            </span>
                          </div>
                          <span className="host-ics-event-clean">
                            🧹 {ev.checkout} {icsStartTime}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {icsError && <p className="form-error">{icsError}</p>}
                    <div className="host-form-actions">
                      <button
                        className="secondary-link"
                        type="button"
                        onClick={() => { setIcsStep(1); setIcsError(""); }}
                      >
                        {t("icsModal.back")}
                      </button>
                      <button
                        className="primary-link auth-submit"
                        type="button"
                        disabled={icsImporting || icsSelected.size === 0}
                        onClick={() => void importIcsJobs()}
                      >
                        {icsImporting
                          ? t("icsModal.creatingJobs")
                          : t("icsModal.createJobs", { count: icsSelected.size })}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ JOB FORM MODAL ══ */}
      {showJobForm && (
        <div
          className="host-modal-backdrop"
          onClick={() => setShowJobForm(false)}
          role="dialog"
          aria-modal="true"
          aria-label={editingJobId !== null ? t("jobForm.editTitle") : t("jobForm.postTitle")}
        >
          <div className="host-modal" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{editingJobId !== null ? t("jobForm.editTitle") : t("jobForm.postTitle")}</h2>
              <button type="button" className="host-modal-close" onClick={() => setShowJobForm(false)} aria-label={t("common.close")}>
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(e) => void submitJob(e)}>
              <label>
                <span>{t("icsModal.propertyLabel")}</span>
                <select
                  required
                  value={jobPropId}
                  onChange={(e) => setJobPropId(e.target.value)}
                >
                  <option value="">{t("icsModal.propertyPlaceholder")}</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.city}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("jobForm.titleLabel")}</span>
                <input
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={t("jobForm.titlePlaceholder")}
                />
              </label>
              <div className="form-grid">
                <label style={{ gridColumn: "1 / -1" }}>
                  <span>{t("jobForm.date")}</span>
                  <input
                    required
                    type="date"
                    value={jobDate}
                    onChange={(e) => setJobDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t("jobForm.startTime")}</span>
                  <input
                    required
                    type="time"
                    value={jobStartTime}
                    onChange={(e) => setJobStartTime(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t("jobForm.endTime")}</span>
                  <input
                    required
                    type="time"
                    value={jobEndTime}
                    onChange={(e) => setJobEndTime(e.target.value)}
                  />
                </label>
                <label>
                  <span>{t("jobForm.price")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={jobPrice}
                    onChange={(e) => setJobPrice(e.target.value)}
                    placeholder="45.00"
                  />
                </label>
              </div>
              <label>
                <span>{t("jobForm.notes")}</span>
                <textarea
                  rows={3}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder={t("jobForm.notesPlaceholder")}
                />
              </label>
              {editingJobId === null && (
                <p className="host-form-hint">
                  {t.rich("jobForm.draftHint", { strong: (chunks) => <strong>{chunks}</strong> })}
                </p>
              )}
              {jobError && <p className="form-error">{jobError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setShowJobForm(false)}>
                  {t("common.cancel")}
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingJob}>
                  {savingJob ? t("common.saving") : editingJobId !== null ? t("account.saveChanges") : t("jobForm.saveAsDraft")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewProfileId !== null && (
        <CleanerProfileModal
          cleanerId={viewProfileId}
          onClose={() => setViewProfileId(null)}
        />
      )}

      {offerTarget !== null && (
        <JobOfferModal
          cleanerUserId={offerTarget.userId}
          cleanerName={offerTarget.name}
          properties={properties.map((p) => ({
            id: p.id,
            name: p.name,
            city: p.city,
            default_price_eur: p.default_price_eur,
          }))}
          onClose={() => setOfferTarget(null)}
          onOffered={() => void loadAll()}
        />
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
          onCancelled={(updated) => {
            setAllJobs((current) => current.map((job) => (
              job.id === updated.id ? { ...job, ...updated } as CleaningJob : job
            )));
            void loadAll(true);
          }}
        />
      ) : null}
    </>
  );
}

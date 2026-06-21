"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
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
import { apiFetch, CurrentUser, type FavouriteCleaner } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import { useLiveRefresh } from "../../lib/useLiveRefresh";
import CleanerProfileModal from "../../components/CleanerProfileModal";
import NotificationBell from "../../components/NotificationBell";
import Connections from "../../components/Connections";
import AppdashGrid from "../../components/AppdashGrid";
import { useAppdashPrefs } from "../../lib/useAppdashPrefs";
import JobOfferModal from "../../components/JobOfferModal";
import ReviewModal from "../../components/ReviewModal";
import RatingStars from "../../components/RatingStars";
import AccountDeletionPanel from "../../components/AccountDeletionPanel";

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
  image: string;   // absolute URL from DRF
  caption: string;
  order: number;
}

interface Property {
  id: number;
  name: string;
  city: string;
  neighborhood: string;
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

type JobStatus = "draft" | "open" | "assigned" | "completed" | "cancelled" | "disputed";

interface CleaningJob {
  id: number;
  property: number;
  title: string;
  scheduled_start: string; // ISO 8601
  scheduled_end: string;
  proposed_price: string | null;
  status: JobStatus;
  description: string;
}

// ── Calendar helpers ───────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
function sqmError(value: string): string {
  const v = value.trim();
  if (v === "") return "";
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return "Enter a size greater than 0.";
  if (!Number.isInteger(num * 2)) return "Size must be a whole or half number (e.g. 52 or 52.5).";
  return "";
}

// ── Status display ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<JobStatus, string> = {
  draft:     "var(--muted)",
  open:      "var(--teal)",
  assigned:  "var(--gold)",
  completed: "#22c55e",
  cancelled: "var(--brand)",
  disputed:  "#f97316",
};
const STATUS_LABEL: Record<JobStatus, string> = {
  draft:     "Draft",
  open:      "Open",
  assigned:  "Assigned",
  completed: "Done",
  cancelled: "Cancelled",
  disputed:  "Disputed",
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
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<number | null>(null);
  const [expandedAppsJobId, setExpandedAppsJobId] = useState<number | null>(null); // job whose applicants are shown in the calendar panel
  const [deletingJobId,      setDeletingJobId]      = useState<number | null>(null);

  // ── Reviews ────────────────────────────────────────────────────────────────
  const [reviews,         setReviews]         = useState<Review[]>([]);
  const [reviewTarget, setReviewTarget] = useState<
    { jobId: number; jobTitle: string; revieweeId: number; revieweeName: string } | null
  >(null);
  const [appFilter, setAppFilter] = useState<"pending" | "active" | "completed" | "open" | "rating" | null>(null);
  const appdash = useAppdashPrefs(me);

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
  const [icsInputMode,   setIcsInputMode]   = useState<"file" | "url">("file");
  const [icsPropId,      setIcsPropId]      = useState("");
  const [icsFile,        setIcsFile]        = useState<File | null>(null);
  const [icsUrl,         setIcsUrl]         = useState("");
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
        setDataError("Could not load properties.");
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
        setDataError("Network error. Check that the backend is running.");
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
    setEditingPropId(null);
    setPropName(""); setPropCity("Sofia"); setPropAddress(""); setPropNeighborhood("");
    setPropLat(null); setPropLng(null);
    setPropDescription(""); setPropBedrooms(""); setPropSqm("");
    setPropDuration("120"); setPropPrice("");
    setExistingImages([]); setNewImageFiles([]); setNewImagePreviews([]);
    setDeletingImageIds(new Set());
    setPropError("");
    setShowPropForm(true);
  }

  function openEditProp(p: Property) {
    setEditingPropId(p.id);
    setPropName(p.name);
    setPropCity(p.city);
    setPropAddress(p.address ?? "");
    setPropNeighborhood(p.neighborhood ?? "");
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
    // Validate client-side before any request — size must be whole/half m².
    const sqmErr = sqmError(propSqm);
    if (sqmErr) {
      setPropError(sqmErr);
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
        setPropError(msgs || "Could not save property.");
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
        setJobError(msgs || "Could not save job.");
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

  // ── Delete job ─────────────────────────────────────────────────────────────
  async function deleteJob(id: number) {
    setDeletingJobId(id);
    try {
      const res = await apiFetch(`/api/marketplace/jobs/${id}/`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setAllJobs((prev) => prev.filter((j) => j.id !== id));
      }
    } finally {
      setDeletingJobId(null);
      setConfirmDeleteJobId(null);
    }
  }

  // ── Submit review ───────────────────────────────────────────────────────────
  // ── Reviews ──────────────────────────────────────────────────────────────
  // The cleaner marks a job done (no host completion step); the host then
  // reviews the cleaner through the review window (ReviewModal).
  function openReview(asgn: HostAssignment) {
    setReviewTarget({
      jobId: asgn.job,
      jobTitle: asgn.job_title,
      revieweeId: asgn.cleaner,
      revieweeName: asgn.cleaner_name,
    });
  }

  // ── ICS import handlers ────────────────────────────────────────────────────
  function openIcsModal() {
    setIcsStep(1);
    setIcsInputMode("file");
    setIcsPropId(properties.length === 1 ? String(properties[0].id) : "");
    setIcsFile(null);
    setIcsUrl("");
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
      let res: Response;
      if (icsInputMode === "url") {
        if (!icsUrl.trim()) { setIcsError("Please paste an Airbnb calendar URL."); setIcsParsing(false); return; }
        res = await apiFetch("/api/properties/fetch-ics-url/", {
          method: "POST",
          body: JSON.stringify({ url: icsUrl.trim() }),
        });
      } else {
        if (!icsFile) { setIcsError("Please select an .ics file."); setIcsParsing(false); return; }
        const formData = new FormData();
        formData.append("ics_file", icsFile);
        res = await apiFetch("/api/properties/parse-ics/", { method: "POST", body: formData });
      }
      const data = await res.json() as IcsEvent[] | { detail: string };
      if (!res.ok) {
        setIcsError((data as { detail: string }).detail ?? "Failed to parse calendar.");
        return;
      }
      const events = data as IcsEvent[];
      if (events.length === 0) {
        setIcsError("No reservations found. Blocked dates are excluded automatically.");
        return;
      }
      setIcsEvents(events);
      setIcsSelected(new Set(events.map((e) => e.uid)));
      setIcsStep(2);
    } finally {
      setIcsParsing(false);
    }
  }

  async function importIcsJobs() {
    if (!icsPropId) { setIcsError("Please select a property."); return; }
    const toCreate = icsEvents.filter((e) => icsSelected.has(e.uid));
    if (toCreate.length === 0) { setIcsError("Select at least one event to import."); return; }

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
        setAccountError("Could not save your account details.");
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
          setAccountError("Could not save your host profile.");
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
    return properties.find((p) => p.id === id)?.images?.[0]?.image ?? null;
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
    const asgn = allAssignments.find((a) => a.job === requestedReviewJobId && a.completed_at);
    if (!asgn) return;
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
    return <main className="host-page"><p className="host-loading">Loading…</p></main>;
  }
  if (!me) {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">Protected area</p>
          <h1>Log in to continue</h1>
          <Link className="primary-link" href="/login">Go to login</Link>
        </section>
      </main>
    );
  }
  if (me.role !== "host") {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">Hosts only</p>
          <h1>Wrong dashboard</h1>
          <p>This dashboard is for property owners.</p>
          <Link className="secondary-link" href="/app">Go to your workspace</Link>
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
          <strong>Host Cleaners</strong>
        </Link>

        <nav className="host-section-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={`host-tab${section === "jobs" ? " active" : ""}`}
            onClick={() => setSection("jobs")}
          >
            <CalendarDays size={15} aria-hidden />
            Jobs &amp; Calendar
          </button>
          <button
            type="button"
            className={`host-tab${section === "applications" ? " active" : ""}`}
            onClick={() => setSection("applications")}
          >
            <ClipboardList size={15} aria-hidden />
            Applications
            {pendingCount > 0 && (
              <span className="host-tab-count host-tab-count--alert">{pendingCount}</span>
            )}
          </button>
          <Connections meId={me.id} />
        </nav>

        <div className="host-topbar-right">
          <Link className="text-link" href="/cleaners">
            <Users size={15} aria-hidden />
            Find cleaners
          </Link>
          <NotificationBell />
          <div className="cleaner-account-menu" ref={accountMenuRef}>
            <button
              className="cleaner-account-menu-trigger"
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label="Account menu"
            >
              <User size={18} aria-hidden />
            </button>
            {accountMenuOpen && (
              <div className="cleaner-account-menu-dropdown" role="menu" aria-label="Account menu">
                <div className="cleaner-account-menu-identity">
                  <strong>{displayName}</strong>
                  <span>Host</span>
                </div>
                <button type="button" className="cleaner-account-menu-item" role="menuitem" onClick={openAccountFromMenu}>
                  <UserRoundCheck size={16} aria-hidden />
                  Profile
                </button>
                <div className="account-language-picker">
                  <span>Language</span>
                  <div className="account-language-slider" role="group" aria-label="Language">
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
                  Log out
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
            aria-label="Your properties"
          >
            <div className="host-rail-head">
              <button
                type="button"
                className="host-rail-toggle"
                onClick={toggleRail}
                title={railExpanded ? "Collapse properties panel" : "Expand properties panel"}
                aria-label={railExpanded ? "Collapse properties panel" : "Expand properties panel"}
              >
                {railExpanded ? <ChevronLeft size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
              </button>
            </div>

            <button
              type="button"
              className={`host-rail-card host-rail-card--btn${selectedPropertyId == null ? " host-rail-card--active" : ""}`}
              onClick={() => setSelectedPropertyId(null)}
              title="All properties"
              aria-label="All properties"
            >
              <span className="host-rail-thumb host-rail-thumb--icon">
                <LayoutGrid size={22} aria-hidden />
              </span>
              <span className="host-rail-card-text host-rail-fade">
                <span className="host-rail-card-name">All properties</span>
              </span>
            </button>

            <div className="host-rail-list">
              {properties.map((p) => {
                const railThumb = p.images?.[0]?.image ?? null;
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
              title="Add property"
              aria-label="Add property"
            >
              <span className="host-rail-thumb host-rail-thumb--icon host-rail-thumb--add">
                <Plus size={22} aria-hidden />
              </span>
              <span className="host-rail-card-text host-rail-fade">
                <span className="host-rail-card-name">Add property</span>
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
              aria-label="Filter by property"
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" className="host-rail-mobile-add" onClick={openCreateProp}>
              <Plus size={15} aria-hidden /> Add
            </button>
          </div>
        )}

        {/* ── Pending banner ── */}
        {!isApproved && (
          <div className="host-pending-banner">
            ⏳ Your account is <strong>{me.account_status}</strong>. You can browse, but cannot
            create properties or jobs until a marketplace admin approves your account.
          </div>
        )}
        {dataError && <p className="form-error" style={{ margin: "16px 24px 0" }}>{dataError}</p>}

        {/* ══ APPLICATIONS SECTION ══ */}
        {section === "applications" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Cleaner requests</p>
                <h1 className="host-section-title">Applications</h1>
              </div>
              {!loadingData && (
                <button
                  type="button"
                  className="secondary-link host-appdash-edit-btn"
                  onClick={() => appdash.setEditing(!appdash.editing)}
                >
                  {appdash.editing ? "Done" : "Edit cards"}
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
                openSub="awaiting cleaners"
                rating={hostRatingAvg}
                ratingCount={hostReviews.length}
                moneyLabel="Spent"
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
                  <Heart size={15} aria-hidden fill="currentColor" /> My cleaners
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
                            onClick={() => setViewProfileId(fav.cleaner_profile_id)}
                          >
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          className="host-offer-trigger"
                          onClick={() => setOfferTarget({ userId: fav.cleaner, name: fav.cleaner_name })}
                        >
                          <Send size={12} aria-hidden /> Offer
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
              <p className="host-empty">Loading…</p>
            ) : (
              <>
                {/* ── Pending applications ── */}
                {(appFilter === null || appFilter === "pending") && (
                <div className="host-apps-subsection">
                  <h2 className="host-apps-subtitle">
                    Awaiting your review
                    {pendingCount > 0 && (
                      <span className="host-apps-subtitle-count">{pendingCount}</span>
                    )}
                  </h2>

                  {applications.filter((a) => a.status === "pending").length === 0 ? (
                    <div className="host-apps-empty">
                      <ClipboardList size={32} />
                      <p>No pending applications.</p>
                      <span className="host-apps-empty-hint">
                        Cleaners will appear here once they apply to your open jobs.
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
                                    onClick={() => setViewProfileId(app.cleaner_profile_id)}
                                  >
                                    View profile
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`host-fav-toggle${isFavourited(app.cleaner) ? " host-fav-toggle--on" : ""}`}
                                  aria-pressed={isFavourited(app.cleaner)}
                                  aria-label={isFavourited(app.cleaner) ? "Remove from saved cleaners" : "Save cleaner"}
                                  onClick={() => void toggleFavourite(app.cleaner)}
                                >
                                  <Heart size={13} aria-hidden fill={isFavourited(app.cleaner) ? "currentColor" : "none"} />
                                  {isFavourited(app.cleaner) ? "Saved" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="host-offer-trigger"
                                  onClick={() => setOfferTarget({ userId: app.cleaner, name: app.cleaner_name })}
                                >
                                  <Send size={13} aria-hidden /> Offer job
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
                                  <small>listed</small>
                                </span>
                              ) : null}

                              <div className="host-app-actions">
                                {app.origin === "host_offered" ? (
                                  // The host sent this offer — only the cleaner can accept it,
                                  // so there's no Accept button here, just a withdraw option.
                                  <span className="host-app-badge host-app-badge--offer">
                                    Offer sent · awaiting cleaner
                                  </span>
                                ) : (
                                  <button
                                    className="host-app-accept-btn"
                                    type="button"
                                    disabled={actingAppId === app.id}
                                    onClick={() => void acceptApplication(app.id)}
                                  >
                                    <Check size={13} aria-hidden />
                                    {actingAppId === app.id ? "…" : "Accept"}
                                  </button>
                                )}
                                <button
                                  className="host-app-reject-btn"
                                  type="button"
                                  disabled={actingAppId === app.id}
                                  onClick={() => void rejectApplication(app.id)}
                                >
                                  <X size={13} aria-hidden />
                                  {app.origin === "host_offered" ? "Withdraw" : "Decline"}
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
                  <h2 className="host-apps-subtitle">Active assignments</h2>

                  {assignments.filter((a) => !a.completed_at).length === 0 ? (
                    <div className="host-apps-empty">
                      <Check size={32} />
                      <p>No active assignments yet.</p>
                      <span className="host-apps-empty-hint">
                        Accept a cleaner application to create an assignment.
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
                              <span className="host-app-badge host-app-badge--assigned">Assigned</span>
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
                    <h2 className="host-apps-subtitle host-apps-subtitle--muted">Completed</h2>
                    {assignments.filter((a) => a.completed_at).length === 0 ? (
                      <div className="host-apps-empty">
                        <Check size={32} />
                        <p>No completed cleanings yet.</p>
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
                              <span className="host-app-badge host-app-badge--done">✓ Done</span>
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
                                    ★ {mine ? "View review" : "Leave a review"}
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
                    <h2 className="host-apps-subtitle">Reviews received</h2>
                    {hostReviews.length === 0 ? (
                      <p className="host-empty">No reviews yet — ratings appear after a completed job.</p>
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
                    <h2 className="host-apps-subtitle">Open jobs</h2>
                    {jobs.filter((j) => j.status === "open").length === 0 ? (
                      <div className="host-apps-empty">
                        <CalendarDays size={32} />
                        <p>No open jobs.</p>
                        <span className="host-apps-empty-hint">
                          Publish a draft job to start receiving applications.
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
                                        {act.pendingApps} application{act.pendingApps !== 1 ? "s" : ""}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="host-app-card-right">
                                  {job.proposed_price && (
                                    <span className="host-app-price">€{job.proposed_price}</span>
                                  )}
                                  <span className="host-app-badge host-app-badge--open">Open</span>
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
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Turnover schedule</p>
                <h1 className="host-section-title">Jobs &amp; Calendar</h1>
              </div>
              {isApproved && properties.length > 0 && (
                <div className="host-section-actions">
                  <button
                    className="secondary-link"
                    type="button"
                    onClick={openIcsModal}
                  >
                    <Upload size={16} aria-hidden />
                    Import ICS
                  </button>
                  <button
                    className="primary-link"
                    type="button"
                    onClick={() => { setJobError(""); openJobForm(undefined, undefined, selectedPropertyId ?? undefined); }}
                  >
                    <Plus size={16} aria-hidden />
                    Post a job
                  </button>
                </div>
              )}
            </div>

            {!isApproved ? (
              <div className="host-empty-state">
                <CalendarDays size={40} />
                <p>Jobs are available after your account is approved.</p>
              </div>
            ) : properties.length === 0 ? (
              <div className="host-activation">
                <span className="host-activation-icon">
                  <Building2 size={26} aria-hidden />
                </span>
                <div className="host-activation-body">
                  <h2>Add your first property</h2>
                  <p>
                    Set it up once, then post a turnover cleaning in under a minute —
                    verified cleaners in your area can apply right away.
                  </p>
                </div>
                <button className="primary-link host-activation-cta" type="button" onClick={openCreateProp}>
                  <Plus size={16} aria-hidden />
                  Add your first property
                </button>
              </div>
            ) : loadingData ? (
              <p className="host-empty">Loading…</p>
            ) : (
              <div className="host-jobs-layout">

                {/* ── Calendar panel ── */}
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
                        Show all
                      </button>
                    )}
                  </div>

                  {visibleJobs.length === 0 ? (
                    <div className="host-job-empty">
                      <p>No jobs {selectedDay ? "on this day" : "this month"}.</p>
                      <button
                        className="secondary-link"
                        type="button"
                        onClick={() => { setJobError(""); openJobForm(selectedDay ?? undefined, undefined, selectedPropertyId ?? undefined); }}
                      >
                        <Plus size={14} aria-hidden />
                        Post one
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
                                  ? "waiting for cleaner"
                                  : act.assignment.cleaner_completed_at
                                    ? "cleaner confirmed"
                                    : "assigned";
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
                                    {act.pendingApps} application{act.pendingApps !== 1 ? "s" : ""}
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
                                      Publish
                                    </button>
                                    <button
                                      className="host-edit-btn"
                                      type="button"
                                      onClick={() => { setJobError(""); openJobForm(undefined, job); }}
                                      aria-label="Edit job"
                                    >
                                      <Pencil size={14} aria-hidden />
                                    </button>
                                  </>
                                )}
                                {(job.status === "draft" || job.status === "open") && (
                                  confirmDeleteJobId === job.id ? (
                                    <div className="host-delete-confirm">
                                      <button
                                        className="host-delete-confirm-yes"
                                        type="button"
                                        disabled={deletingJobId === job.id}
                                        onClick={() => void deleteJob(job.id)}
                                      >
                                        {deletingJobId === job.id ? "…" : "Delete"}
                                      </button>
                                      <button
                                        className="host-delete-confirm-no"
                                        type="button"
                                        onClick={() => setConfirmDeleteJobId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      className="host-delete-btn"
                                      type="button"
                                      onClick={() => setConfirmDeleteJobId(job.id)}
                                      aria-label="Delete job"
                                    >
                                      <Trash2 size={14} aria-hidden />
                                    </button>
                                  )
                                )}
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
                                          Offer sent · awaiting cleaner
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
                                            {actingAppId === app.id ? "…" : "Accept"}
                                          </button>
                                          <button
                                            type="button"
                                            className="host-app-reject-btn"
                                            disabled={actingAppId === app.id}
                                            onClick={() => void rejectApplication(app.id)}
                                          >
                                            <X size={13} aria-hidden />
                                            Decline
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
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Your account</p>
                <h1 className="host-section-title">Host profile</h1>
              </div>
            </div>

            <form className="host-form host-account-form" onSubmit={(e) => void saveAccount(e)}>
              <div className="form-grid">
                <label>
                  <span>First name</span>
                  <input value={accountFirstName} onChange={(e) => setAccountFirstName(e.target.value)} />
                </label>
                <label>
                  <span>Last name</span>
                  <input value={accountLastName} onChange={(e) => setAccountLastName(e.target.value)} />
                </label>
                <label>
                  <span>Phone number</span>
                  <input value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} placeholder="+359…" />
                </label>
                <label>
                  <span>Email</span>
                  <input value={me.email} readOnly disabled />
                </label>
                <label>
                  <span>Company name</span>
                  <input value={accountCompany} onChange={(e) => setAccountCompany(e.target.value)} placeholder="Optional" />
                </label>
                <label>
                  <span>City</span>
                  <input value={accountCity} onChange={(e) => setAccountCity(e.target.value)} placeholder="Sofia" />
                </label>
              </div>

              <label>
                <span>Notes</span>
                <textarea
                  rows={3}
                  value={accountNotes}
                  onChange={(e) => setAccountNotes(e.target.value)}
                  placeholder="Anything cleaners should know about working with you…"
                />
              </label>

              {accountError && <p className="form-error">{accountError}</p>}
              {accountSaved && <p className="cleaner-success">Profile saved.</p>}
              <div className="host-form-actions">
                <button className="primary-link auth-submit" type="submit" disabled={savingAccount}>
                  {savingAccount ? "Saving…" : "Save changes"}
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
          aria-label={editingPropId !== null ? "Edit property" : "Add property"}
        >
          <div className="host-modal host-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{editingPropId !== null ? "Edit property" : "Add property"}</h2>
              <button type="button" className="host-modal-close" onClick={closePropForm} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(e) => void submitProperty(e)}>

              {/* ── Basic info ── */}
              <div className="form-grid">
                <label>
                  <span>Property name *</span>
                  <input
                    required
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="Sea View Apartment"
                  />
                </label>
                <label>
                  <span>City *</span>
                  <select
                    required
                    value={propCity}
                    disabled={editingPropHasActiveJobs}
                    onChange={(e) => { setPropCity(e.target.value); if (editingPropId === null) { setPropLat(null); setPropLng(null); } }}
                  >
                    <option value="Sofia">Sofia</option>
                    <option value="Plovdiv">Plovdiv</option>
                    <option value="Varna">Varna</option>
                  </select>
                </label>
              </div>

              {editingPropHasActiveJobs && (
                <p className="prop-address-locked-notice">
                  Address cannot be changed while this property has active jobs (draft, open, or assigned).
                </p>
              )}

              {/* ── Location map ── */}
              <div
                className="prop-location-section"
                style={editingPropHasActiveJobs ? { pointerEvents: "none", opacity: 0.5 } : undefined}
              >
                <p className="prop-location-label">Pin location on map <span className="prop-location-hint">(click to set)</span></p>
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
                  <span>Street address</span>
                  <input
                    value={propAddress}
                    readOnly={editingPropHasActiveJobs}
                    onChange={(e) => !editingPropHasActiveJobs && setPropAddress(e.target.value)}
                    placeholder="Auto-filled from map, or enter manually"
                  />
                </label>
                <label>
                  <span>Neighborhood / District</span>
                  <input
                    value={propNeighborhood}
                    readOnly
                    className="prop-readonly-field"
                    placeholder="Set automatically from the map pin"
                    title="The district is taken from the map pin"
                    tabIndex={-1}
                    aria-readonly="true"
                  />
                </label>
                <label>
                  <span>Bedrooms</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={propBedrooms}
                    onChange={(e) => setPropBedrooms(e.target.value)}
                    placeholder="e.g. 2"
                  />
                </label>
                <label className="prop-size-field">
                  <span>Size (m²)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={propSqm}
                    onChange={(e) => setPropSqm(e.target.value)}
                    placeholder="e.g. 65"
                    aria-invalid={sqmError(propSqm) ? true : undefined}
                    className={sqmError(propSqm) ? "input-invalid" : undefined}
                  />
                  {sqmError(propSqm) && (
                    <small className="field-error-text">{sqmError(propSqm)}</small>
                  )}
                </label>
                <label>
                  <span>Default clean duration (min)</span>
                  <input
                    type="number"
                    min="30"
                    step="30"
                    value={propDuration}
                    onChange={(e) => setPropDuration(e.target.value)}
                  />
                </label>
                <label>
                  <span>Default price (EUR)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    placeholder="e.g. 45"
                  />
                </label>
              </div>

              <label>
                <span>Description</span>
                <textarea
                  rows={3}
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  placeholder="Describe the property for cleaners — layout, special features, parking…"
                />
              </label>

              {/* ── Photos ── */}
              <div className="prop-photos-section">
                <p className="prop-photos-label">Photos</p>

                {/* Existing images (edit mode) */}
                {existingImages.length > 0 && (
                  <div className="prop-photos-grid">
                    {existingImages.map((img) => (
                      <div key={img.id} className="prop-photo-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.image} alt={img.caption || "Property photo"} />
                        <button
                          type="button"
                          className="prop-photo-delete"
                          disabled={deletingImageIds.has(img.id)}
                          onClick={() => void deleteExistingImage(img.id)}
                          aria-label="Remove photo"
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
                          aria-label="Remove photo"
                        >
                          <X size={13} />
                        </button>
                        <span className="prop-photo-new-badge">New</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                <label className="prop-photos-upload-btn">
                  <Upload size={15} aria-hidden />
                  Add photos
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="prop-photos-file-input"
                    onChange={handlePhotoChange}
                  />
                </label>
                <p className="prop-photos-hint">JPG, PNG, WebP — multiple files allowed.</p>
              </div>

              {propError && <p className="form-error">{propError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={closePropForm}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingProp}>
                  {savingProp
                    ? (newImageFiles.length > 0 ? "Uploading…" : "Saving…")
                    : (editingPropId !== null ? "Save changes" : "Add property")}
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
          aria-label="Import Airbnb calendar"
        >
          <div className="host-modal host-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <div>
                <h2>Import from Airbnb</h2>
                <p className="host-modal-subtitle">
                  {icsStep === 1
                    ? "Upload your Airbnb .ics file to create cleaning jobs automatically."
                    : `Found ${icsEvents.length} reservation${icsEvents.length !== 1 ? "s" : ""}. Select the ones to import.`}
                </p>
              </div>
              <button type="button" className="host-modal-close" onClick={() => setShowIcsModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* ── Step 1: Upload / URL ── */}
            {icsStep === 1 && (
              <div className="host-form">
                <label>
                  <span>Property *</span>
                  <select
                    required
                    value={icsPropId}
                    onChange={(e) => setIcsPropId(e.target.value)}
                  >
                    <option value="">Select a property…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
                    ))}
                  </select>
                </label>

                {/* Mode toggle */}
                <div className="host-ics-mode-tabs">
                  <button
                    type="button"
                    className={`host-ics-mode-tab${icsInputMode === "file" ? " host-ics-mode-tab--active" : ""}`}
                    onClick={() => { setIcsInputMode("file"); setIcsError(""); }}
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    className={`host-ics-mode-tab${icsInputMode === "url" ? " host-ics-mode-tab--active" : ""}`}
                    onClick={() => { setIcsInputMode("url"); setIcsError(""); }}
                  >
                    Paste link
                  </button>
                </div>

                {icsInputMode === "file" ? (
                  <>
                    <label className="host-ics-file-label">
                      <span>Airbnb calendar file (.ics) *</span>
                      <div className="host-ics-drop-zone">
                        <Upload size={28} className="host-ics-drop-icon" aria-hidden />
                        <span>{icsFile ? icsFile.name : "Click to choose file or drop here"}</span>
                        <input
                          type="file"
                          accept=".ics,text/calendar"
                          className="host-ics-file-input"
                          onChange={(e) => setIcsFile(e.target.files?.[0] ?? null)}
                        />
                      </div>
                    </label>
                    <p className="host-form-hint">
                      Airbnb → Calendar → Export calendar → download the .ics file and upload it here.
                    </p>
                  </>
                ) : (
                  <>
                    <label>
                      <span>Airbnb calendar link *</span>
                      <input
                        type="url"
                        value={icsUrl}
                        onChange={(e) => setIcsUrl(e.target.value)}
                        placeholder="https://www.airbnb.com/calendar/ical/…"
                        autoComplete="off"
                      />
                    </label>
                    <p className="host-form-hint">
                      Airbnb → Listing → Calendar → Connect other calendars → Export calendar → copy the link and paste it above.
                    </p>
                  </>
                )}

                {icsError && <p className="form-error">{icsError}</p>}
                <div className="host-form-actions">
                  <button className="secondary-link" type="button" onClick={() => setShowIcsModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="primary-link auth-submit"
                    type="button"
                    disabled={icsParsing || !icsPropId || (icsInputMode === "file" ? !icsFile : !icsUrl.trim())}
                    onClick={() => void parseIcs()}
                  >
                    {icsParsing ? "Reading…" : "Continue"}
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
                      ✅ {icsImportDone.created} job{icsImportDone.created !== 1 ? "s" : ""} created as draft
                      {icsImportDone.skipped > 0 && ` · ${icsImportDone.skipped} skipped`}
                    </p>
                    <p className="host-form-hint">Publish each job to make it visible to cleaners.</p>
                    <div className="host-form-actions">
                      <button className="primary-link" type="button" onClick={() => setShowIcsModal(false)}>
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label>
                      <span>Cleaning start time on checkout day</span>
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
                        {icsSelected.size === icsEvents.length ? "Deselect all" : "Select all"}
                      </button>
                      <span className="host-muted">{icsSelected.size} of {icsEvents.length} selected</span>
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
                              Check-in {ev.checkin} → Checkout <strong>{ev.checkout}</strong>
                              <span className="host-ics-event-nights">· {ev.nights} night{ev.nights !== 1 ? "s" : ""}</span>
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
                        Back
                      </button>
                      <button
                        className="primary-link auth-submit"
                        type="button"
                        disabled={icsImporting || icsSelected.size === 0}
                        onClick={() => void importIcsJobs()}
                      >
                        {icsImporting
                          ? `Creating jobs…`
                          : `Create ${icsSelected.size} job${icsSelected.size !== 1 ? "s" : ""}`}
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
          aria-label={editingJobId !== null ? "Edit job" : "Post a cleaning job"}
        >
          <div className="host-modal" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{editingJobId !== null ? "Edit job" : "Post a cleaning job"}</h2>
              <button type="button" className="host-modal-close" onClick={() => setShowJobForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(e) => void submitJob(e)}>
              <label>
                <span>Property *</span>
                <select
                  required
                  value={jobPropId}
                  onChange={(e) => setJobPropId(e.target.value)}
                >
                  <option value="">Select a property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.city}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Job title *</span>
                <input
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Guest checkout cleaning"
                />
              </label>
              <div className="form-grid">
                <label style={{ gridColumn: "1 / -1" }}>
                  <span>Cleaning date *</span>
                  <input
                    required
                    type="date"
                    value={jobDate}
                    onChange={(e) => setJobDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>Start time *</span>
                  <input
                    required
                    type="time"
                    value={jobStartTime}
                    onChange={(e) => setJobStartTime(e.target.value)}
                  />
                </label>
                <label>
                  <span>End time *</span>
                  <input
                    required
                    type="time"
                    value={jobEndTime}
                    onChange={(e) => setJobEndTime(e.target.value)}
                  />
                </label>
                <label>
                  <span>Proposed price (EUR)</span>
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
                <span>Notes / special instructions</span>
                <textarea
                  rows={3}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Any access notes, key location, special requirements…"
                />
              </label>
              {editingJobId === null && (
                <p className="host-form-hint">
                  Jobs are saved as <strong>Draft</strong> first. Publish to make them visible to cleaners.
                </p>
              )}
              {jobError && <p className="form-error">{jobError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setShowJobForm(false)}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingJob}>
                  {savingJob ? "Saving…" : editingJobId !== null ? "Save changes" : "Save as draft"}
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
          onClose={() => setReviewTarget(null)}
          onSubmitted={() => void loadAll()}
        />
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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
  UserRoundCheck,
  X,
} from "lucide-react";
import { apiFetch, CurrentUser } from "../../lib/api";

type JobStatus = "draft" | "open" | "assigned" | "completed" | "cancelled" | "disputed";
type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";
type CleanerSex = "male" | "female" | "prefer_not_to_say";

interface CleanerProfile {
  id: number;
  verification_status: VerificationStatus;
  bio: string;
  service_areas: string[];
  sex: CleanerSex;
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
  agreed_price: string | null;
  assigned_at: string;
  completed_at: string | null;
}

interface CleaningJob {
  id: number;
  property: number;
  property_name?: string;
  property_city?: string;
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

type Section = "calendar" | "jobs" | "applications" | "assignments" | "profile";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CLEANER_CITY_OPTIONS = [
  "Sofia",
  "Plovdiv",
  "Varna",
  "Burgas",
  "Bansko",
  "Ruse",
  "Stara Zagora",
];
const DEFAULT_PROFILE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f3f4f6"/><stop offset="100%" stop-color="#e5e7eb"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="120" cy="88" r="40" fill="#cbd5e1"/><path d="M40 214c8-40 38-62 80-62s72 22 80 62H40z" fill="#cbd5e1"/></svg>',
)}`;

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

  const now = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileAreaSelected, setProfileAreaSelected] = useState("");
  const [profileSex, setProfileSex] = useState<CleanerSex>("prefer_not_to_say");
  const [profileImage, setProfileImage] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [applyJob, setApplyJob] = useState<CleaningJob | null>(null);
  const [applyPrice, setApplyPrice] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [completingJobId, setCompletingJobId] = useState<number | null>(null);

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
    setProfileFirstName(me?.first_name || "");
    setProfileLastName(me?.last_name || "");
  }, [me]);

  function syncProfileForm(nextProfile: CleanerProfile) {
    const firstArea = nextProfile.service_areas[0] || "";
    setProfileAreaSelected(firstArea);
    setProfileSex(nextProfile.sex || "prefer_not_to_say");
    setProfileImage(nextProfile.profile_image || "");
    setProfileBio(nextProfile.bio);
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
        if (ownProfile) syncProfileForm(ownProfile);
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

  function onProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !me) return;
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      setProfileError("First name and last name are required.");
      return;
    }
    if (!profileAreaSelected) {
      setProfileError("Select a service area from the dropdown list.");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    setProfileSaved(false);
    const serviceAreas = [profileAreaSelected];
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
      setMe((await userRes.json()) as CurrentUser);

      const res = await apiFetch(`/api/accounts/cleaners/${profile.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          service_areas: serviceAreas,
          sex: profileSex,
          profile_image: profileImage,
          bio: profileBio,
        }),
      });
      if (!res.ok) {
        setProfileError(messageFromResponse(await res.json(), "Could not save profile."));
        return;
      }
      const updated = (await res.json()) as CleanerProfile;
      setProfile(updated);
      syncProfileForm(updated);
      setProfileSaved(true);
    } finally {
      setSavingProfile(false);
    }
  }

  const applicationsByJob = useMemo(() => {
    const map = new Map<number, CleanerApplication>();
    for (const application of applications) {
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

  const openJobs = useMemo(
    () => jobs.filter((job) => job.status === "open").sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
    [jobs],
  );

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
          <button
            type="button"
            className={`host-tab${section === "profile" ? " active" : ""}`}
            onClick={() => setSection("profile")}
          >
            <UserRoundCheck size={15} aria-hidden />
            Profile
          </button>
        </nav>

        <div className="host-topbar-right">
          <span className="user-chip">
            {displayName}
            <span className="user-chip-dot" aria-hidden>·</span>
            Cleaner
          </span>
          <button className="text-link logout-trigger" type="button" onClick={logout}>
            <LogOut size={15} aria-hidden />
            Log out
          </button>
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

            {loadingData ? (
              <p className="host-empty">Loading jobs...</p>
            ) : openJobs.length === 0 ? (
              <div className="host-empty-state">
                <Briefcase size={40} />
                <p>No open jobs are visible right now.</p>
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
                          <span>{jobPlace(job)}{job.host_name ? ` - ${job.host_name}` : ""}</span>
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
                      </div>
                    </li>
                  );
                })}
              </ul>
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
              {profile && (
                <span className={`cleaner-application-chip cleaner-verification-${profile.verification_status}`}>
                  {profile.verification_status}
                </span>
              )}
            </div>

            {!profile ? (
              <div className="host-empty-state">
                <UserRoundCheck size={40} />
                <p>Cleaner profile was not found for this account.</p>
              </div>
            ) : (
              <div className="cleaner-profile-layout">
                <form className="host-form cleaner-profile-form" onSubmit={(event) => void submitProfile(event)}>
                  <label className="cleaner-avatar-uploader">
                    <input type="file" accept="image/*" onChange={onProfileImageChange} />
                    <span className="cleaner-avatar-frame">
                      <Image src={profileImage || DEFAULT_PROFILE_IMAGE} alt="Profile" width={112} height={112} unoptimized />
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
                  </div>
                  <label className="cleaner-city-picker">
                    <span>Service area</span>
                    <select
                      value={profileAreaSelected}
                      onChange={(event) => setProfileAreaSelected(event.target.value)}
                    >
                      <option value="" disabled>Select a city</option>
                      {CLEANER_CITY_OPTIONS.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cleaner-sex-picker">
                    <span>Sex</span>
                    <select value={profileSex} onChange={(event) => setProfileSex(event.target.value as CleanerSex)}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    <span>Bio</span>
                    <textarea
                      rows={5}
                      value={profileBio}
                      onChange={(event) => setProfileBio(event.target.value)}
                      placeholder="Experience, property types, languages, availability..."
                    />
                  </label>
                  {profileError && <p className="form-error">{profileError}</p>}
                  {profileSaved && <p className="cleaner-success"><CheckCircle2 size={15} aria-hidden />Profile saved.</p>}
                  <div className="host-form-actions">
                    <button className="primary-link auth-submit" type="submit" disabled={savingProfile}>
                      {savingProfile ? "Saving..." : "Save profile"}
                    </button>
                  </div>
                </form>

                <aside className="cleaner-profile-summary">
                  <div>
                    <span>Verification</span>
                    <strong>{profile.verification_status}</strong>
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

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home as HomeIcon,
  LogOut,
  Plus,
  X,
} from "lucide-react";
import { Upload } from "lucide-react";
import { apiFetch, CurrentUser } from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface IcsEvent {
  uid: string;
  summary: string;
  checkin: string;   // "YYYY-MM-DD"
  checkout: string;  // "YYYY-MM-DD" — the day cleaning happens
  nights: number;
}

interface Property {
  id: number;
  name: string;
  city: string;
  address: string;
  default_cleaning_duration_minutes: number;
  default_price_eur: string | null;
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

/** Naive date-only slice — avoids TZ shifting for calendar dot placement */
function dateOnly(iso: string) { return iso.slice(0, 10); }

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function HostDashboard() {
  const [me, setMe]           = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [properties, setProperties] = useState<Property[]>([]);
  const [jobs,       setJobs]       = useState<CleaningJob[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError,   setDataError]   = useState("");

  const [section, setSection] = useState<"jobs" | "properties">("jobs");

  // ── Calendar ───────────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);
  const [calYear,     setCalYear]     = useState(now.getFullYear());
  const [calMonth,    setCalMonth]    = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // ── Property form ──────────────────────────────────────────────────────────
  const [showPropForm, setShowPropForm] = useState(false);
  const [propName,     setPropName]     = useState("");
  const [propCity,     setPropCity]     = useState("Sofia");
  const [propAddress,  setPropAddress]  = useState("");
  const [propDuration, setPropDuration] = useState("120");
  const [propPrice,    setPropPrice]    = useState("");
  const [savingProp,   setSavingProp]   = useState(false);
  const [propError,    setPropError]    = useState("");

  // ── Job form ───────────────────────────────────────────────────────────────
  const [showJobForm,  setShowJobForm]  = useState(false);
  const [jobPropId,    setJobPropId]    = useState("");
  const [jobTitle,     setJobTitle]     = useState("");
  const [jobStart,     setJobStart]     = useState("");
  const [jobEnd,       setJobEnd]       = useState("");
  const [jobPrice,     setJobPrice]     = useState("");
  const [jobDesc,      setJobDesc]      = useState("");
  const [savingJob,    setSavingJob]    = useState(false);
  const [jobError,     setJobError]     = useState("");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function loadAll() {
    setLoadingData(true);
    setDataError("");
    const [pRes, jRes] = await Promise.all([
      apiFetch("/api/properties/properties/"),
      apiFetch("/api/marketplace/jobs/"),
    ]);
    if (pRes.ok) {
      const d: unknown = await pRes.json();
      setProperties(Array.isArray(d) ? d as Property[] : (d as { results: Property[] }).results ?? []);
    } else {
      setDataError("Could not load properties.");
    }
    if (jRes.ok) {
      const d: unknown = await jRes.json();
      setJobs(Array.isArray(d) ? d as CleaningJob[] : (d as { results: CleaningJob[] }).results ?? []);
    }
    setLoadingData(false);
  }

  // ── Create property ────────────────────────────────────────────────────────
  async function submitProperty(e: FormEvent) {
    e.preventDefault();
    setPropError("");
    setSavingProp(true);
    try {
      const res = await apiFetch("/api/properties/properties/", {
        method: "POST",
        body: JSON.stringify({
          name: propName,
          city: propCity,
          address: propAddress,
          default_cleaning_duration_minutes: parseInt(propDuration) || 120,
          default_price_eur: propPrice || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const msgs = Object.values(data).flat().join(" ");
        setPropError(msgs || "Could not save property.");
        return;
      }
      const newProp = await res.json() as Property;
      setProperties((prev) => [...prev, newProp]);
      setPropName(""); setPropCity("Sofia"); setPropAddress(""); setPropDuration("120"); setPropPrice("");
      setShowPropForm(false);
    } finally {
      setSavingProp(false);
    }
  }

  // ── Create job ─────────────────────────────────────────────────────────────
  function openJobForm(day?: number) {
    if (day !== undefined) {
      const base = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
      setJobStart(`${base}T10:00`);
      setJobEnd(`${base}T12:00`);
    }
    if (properties.length === 1) setJobPropId(String(properties[0].id));
    setShowJobForm(true);
  }

  async function submitJob(e: FormEvent) {
    e.preventDefault();
    setJobError("");
    setSavingJob(true);
    try {
      const res = await apiFetch("/api/marketplace/jobs/", {
        method: "POST",
        body: JSON.stringify({
          property_id: parseInt(jobPropId),
          title: jobTitle,
          scheduled_start: new Date(jobStart).toISOString(),
          scheduled_end:   new Date(jobEnd).toISOString(),
          proposed_price: jobPrice || null,
          description: jobDesc,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const msgs = Object.values(data).flat().join(" ");
        setJobError(msgs || "Could not save job.");
        return;
      }
      const newJob = await res.json() as CleaningJob;
      setJobs((prev) =>
        [...prev, newJob].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
      );
      setJobPropId(""); setJobTitle(""); setJobStart(""); setJobEnd(""); setJobPrice(""); setJobDesc("");
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
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    }
  }

  // ── ICS import handlers ────────────────────────────────────────────────────
  function openIcsModal() {
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
    if (!icsFile) { setIcsError("Please select an .ics file."); return; }
    setIcsParsing(true);
    setIcsError("");
    try {
      const formData = new FormData();
      formData.append("ics_file", icsFile);
      const res = await apiFetch("/api/properties/parse-ics/", { method: "POST", body: formData });
      const data = await res.json() as IcsEvent[] | { detail: string };
      if (!res.ok) {
        setIcsError((data as { detail: string }).detail ?? "Failed to parse file.");
        return;
      }
      const events = data as IcsEvent[];
      if (events.length === 0) {
        setIcsError("No reservations found in this file. Blocked dates are excluded automatically.");
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
        setJobs((prev) => [...prev, newJob].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)));
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

  function getPropName(id: number) {
    return properties.find((p) => p.id === id)?.name ?? `Property #${id}`;
  }

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
            className={`host-tab${section === "properties" ? " active" : ""}`}
            onClick={() => setSection("properties")}
          >
            <Building2 size={15} aria-hidden />
            Properties
            {properties.length > 0 && (
              <span className="host-tab-count">{properties.length}</span>
            )}
          </button>
        </nav>

        <div className="host-topbar-right">
          <span className="user-chip">
            {me.first_name || me.email.split("@")[0]}
            <span className="user-chip-dot" aria-hidden>·</span>
            Host
          </span>
          <button className="text-link logout-trigger" type="button" onClick={logout}>
            <LogOut size={15} aria-hidden />
            Log out
          </button>
        </div>
      </header>

      <main className="host-page">
        {/* ── Pending banner ── */}
        {!isApproved && (
          <div className="host-pending-banner">
            ⏳ Your account is <strong>{me.account_status}</strong>. You can browse, but cannot
            create properties or jobs until a marketplace admin approves your account.
          </div>
        )}
        {dataError && <p className="form-error" style={{ margin: "16px 24px 0" }}>{dataError}</p>}

        {/* ══ PROPERTIES SECTION ══ */}
        {section === "properties" && (
          <div className="host-section">
            <div className="host-section-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Your listings</p>
                <h1 className="host-section-title">Properties</h1>
              </div>
              {isApproved && (
                <button
                  className="primary-link"
                  type="button"
                  onClick={() => { setPropError(""); setShowPropForm(true); }}
                >
                  <Plus size={16} aria-hidden />
                  Add property
                </button>
              )}
            </div>

            {loadingData ? (
              <p className="host-empty">Loading…</p>
            ) : properties.length === 0 ? (
              <div className="host-empty-state">
                <Building2 size={40} />
                <p>No properties yet.</p>
                {isApproved && (
                  <button
                    className="secondary-link"
                    type="button"
                    onClick={() => { setPropError(""); setShowPropForm(true); }}
                  >
                    Add your first property
                  </button>
                )}
              </div>
            ) : (
              <div className="host-property-grid">
                {properties.map((p) => {
                  const pJobs    = jobs.filter((j) => j.property === p.id);
                  const active   = pJobs.filter((j) => ["open", "assigned"].includes(j.status)).length;
                  return (
                    <article key={p.id} className="host-property-card">
                      <div className="host-property-card-top">
                        <div className="host-property-icon"><Building2 size={20} /></div>
                        <div>
                          <strong>{p.name}</strong>
                          <span>{p.city}{p.address ? ` · ${p.address}` : ""}</span>
                        </div>
                      </div>
                      <div className="host-property-stats">
                        <div>
                          <strong>{pJobs.length}</strong>
                          <small>Total jobs</small>
                        </div>
                        <div>
                          <strong>{active}</strong>
                          <small>Active</small>
                        </div>
                        <div>
                          <strong>{p.default_cleaning_duration_minutes} min</strong>
                          <small>Default clean</small>
                        </div>
                        {p.default_price_eur && (
                          <div>
                            <strong>€{p.default_price_eur}</strong>
                            <small>Default price</small>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
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
                    onClick={() => { setJobError(""); openJobForm(); }}
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
              <div className="host-empty-state">
                <CalendarDays size={40} />
                <p>Add a property first to start posting jobs.</p>
                <button className="secondary-link" type="button" onClick={() => setSection("properties")}>
                  Add a property
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
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                      const dayJobs   = jobsByDay.get(day) ?? [];
                      const isToday   = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
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
                              setJobError(""); openJobForm(day);
                            }
                          }}
                          title={dayJobs.length > 0 ? `${dayJobs.length} job(s)` : "Click to post a job"}
                        >
                          <span className="host-cal-day-num">{day}</span>
                          <div className="host-cal-dots">
                            {dayJobs.slice(0, 4).map((j) => (
                              <span
                                key={j.id}
                                className="host-cal-dot"
                                style={{ background: STATUS_COLOR[j.status] }}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Status legend */}
                  <div className="host-cal-legend">
                    {(Object.entries(STATUS_COLOR) as [JobStatus, string][]).map(([s, c]) => (
                      <span key={s} className="host-cal-legend-item">
                        <span className="host-cal-dot" style={{ background: c }} />
                        {STATUS_LABEL[s]}
                      </span>
                    ))}
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
                        onClick={() => { setJobError(""); openJobForm(selectedDay ?? undefined); }}
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
                          </div>
                          <div className="host-job-right">
                            <span className={`host-job-badge host-job-badge--${job.status}`}>
                              {STATUS_LABEL[job.status]}
                            </span>
                            {job.proposed_price && (
                              <span className="host-job-price">€{job.proposed_price}</span>
                            )}
                            {job.status === "draft" && (
                              <button
                                className="host-publish-btn"
                                type="button"
                                onClick={() => void publishJob(job.id)}
                              >
                                Publish
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ PROPERTY FORM MODAL ══ */}
      {showPropForm && (
        <div
          className="host-modal-backdrop"
          onClick={() => setShowPropForm(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add property"
        >
          <div className="host-modal" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>Add property</h2>
              <button type="button" className="host-modal-close" onClick={() => setShowPropForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form className="host-form" onSubmit={(e) => void submitProperty(e)}>
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
                  <input
                    required
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    placeholder="Sofia"
                  />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  <span>Address</span>
                  <input
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    placeholder="Street and number"
                  />
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
              {propError && <p className="form-error">{propError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setShowPropForm(false)}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingProp}>
                  {savingProp ? "Saving…" : "Add property"}
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

            {/* ── Step 1: Upload ── */}
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
                  In Airbnb → Calendar → Export calendar → download the .ics file and upload it here.
                </p>
                {icsError && <p className="form-error">{icsError}</p>}
                <div className="host-form-actions">
                  <button className="secondary-link" type="button" onClick={() => setShowIcsModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="primary-link auth-submit"
                    type="button"
                    disabled={icsParsing || !icsFile || !icsPropId}
                    onClick={() => void parseIcs()}
                  >
                    {icsParsing ? "Reading file…" : "Continue"}
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
          aria-label="Post a cleaning job"
        >
          <div className="host-modal" onClick={(e) => e.stopPropagation()}>
            <div className="host-modal-header">
              <h2>Post a cleaning job</h2>
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
                <label>
                  <span>Start date &amp; time *</span>
                  <input
                    required
                    type="datetime-local"
                    value={jobStart}
                    onChange={(e) => setJobStart(e.target.value)}
                  />
                </label>
                <label>
                  <span>End date &amp; time *</span>
                  <input
                    required
                    type="datetime-local"
                    value={jobEnd}
                    onChange={(e) => setJobEnd(e.target.value)}
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
              <p className="host-form-hint">
                Jobs are saved as <strong>Draft</strong> first. Publish to make them visible to cleaners.
              </p>
              {jobError && <p className="form-error">{jobError}</p>}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setShowJobForm(false)}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={savingJob}>
                  {savingJob ? "Saving…" : "Save as draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

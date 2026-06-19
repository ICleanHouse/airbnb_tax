// Host dashboard — job lifecycle board with status badges and tabs.
const { useState: useStateHost } = React;

function HostTopbar({ tab, setTab, onLogout, counts }) {
  const tabs = [
    { id: "jobs", label: "Jobs", icon: "calendar", count: counts.open },
    { id: "properties", label: "Properties", icon: "home" },
    { id: "cleaners", label: "Find cleaners", icon: "map-pin" },
  ];
  return (
    <header className="host-topbar">
      <a className="site-brand" href="#"><BrandMark /></a>
      <nav className="host-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`host-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />{t.label}
            {t.count > 0 && <span className="host-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <span className="user-chip">Ivan <span className="user-chip-dot">·</span> Host</span>
        <button className="btn-text" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function JobCard({ job }) {
  const mod = job.status === "open" ? "open" : job.status === "assigned" ? "assigned" : job.status === "completed" ? "done" : "";
  return (
    <div className={`host-app-card host-app-card--${mod}`}>
      <div className="host-app-card-left">
        <div>
          <div className="host-app-job-title">{job.title}</div>
          <div className="host-app-job-meta">
            <span><Icon name="home" /> {job.property} · {job.city}</span>
          </div>
          <div className="host-app-job-meta">
            <Icon name="calendar" /> {job.date} · {job.time}
          </div>
        </div>
        {(job.cleaner || job.applicants) && <div className="host-app-divider"></div>}
        {job.cleaner ? (
          <div className="host-cleaner-row">
            <span className="host-cleaner-avatar">{window.KIT.initials(job.cleaner)}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{job.cleaner}</div>
              <div className="muted-note">{job.status === "completed" ? "Completed this clean" : "Assigned cleaner"}</div>
            </div>
          </div>
        ) : job.applicants ? (
          <div className="muted-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="user-plus" /> {`${job.applicants} ${job.applicants === 1 ? "cleaner" : "cleaners"} applied`}
          </div>
        ) : null}
      </div>
      <div className="host-app-card-right">
        <span className="host-job-price">{job.price}</span>
        <Badge status={job.status} />
        {job.status === "open" && <button className="btn-text">Review applicants</button>}
        {job.status === "assigned" && <button className="btn btn-primary" style={{ minHeight: 36, fontSize: 13, padding: "0 14px" }}>View details</button>}
      </div>
    </div>
  );
}

function HostDashboard({ onLogout, onFindCleaners }) {
  const [tab, setTab] = useStateHost("jobs");
  const jobs = window.KIT.HOST_JOBS;
  const open = jobs.filter((j) => j.status === "open");
  const assigned = jobs.filter((j) => j.status === "assigned");
  const completed = jobs.filter((j) => j.status === "completed");

  React.useEffect(() => { if (tab === "cleaners") onFindCleaners(); }, [tab]);

  return (
    <div className="host-page">
      <HostTopbar tab={tab} setTab={setTab} onLogout={onLogout} counts={{ open: open.length }} />
      <main className="host-section">
        <div className="host-section-header">
          <div>
            <h1 className="host-section-title">Your cleaning jobs</h1>
            <p className="host-section-sub">Post turnovers, review applicants, and track every clean.</p>
          </div>
          <button className="btn btn-primary"><Icon name="send" /> Post a job</button>
        </div>

        <div className="host-cards">
          {open.length > 0 && <SectionLabel>Open · awaiting applicants</SectionLabel>}
          {open.map((j) => <JobCard key={j.id} job={j} />)}
          {assigned.length > 0 && <SectionLabel>Assigned</SectionLabel>}
          {assigned.map((j) => <JobCard key={j.id} job={j} />)}
          {completed.length > 0 && <SectionLabel>Completed</SectionLabel>}
          {completed.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      </main>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginTop: 8 }}>{children}</div>;
}

Object.assign(window, { HostDashboard });

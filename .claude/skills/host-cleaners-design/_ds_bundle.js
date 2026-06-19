/* @ds-bundle: {"format":3,"namespace":"HostCleanersDesignSystem_90c5d5","components":[],"sourceHashes":{"ui_kits/web/CleanerProfileModal.jsx":"3d8f88692813","ui_kits/web/HostDashboard.jsx":"eff56716ffbc","ui_kits/web/Landing.jsx":"8851b8aa2790","ui_kits/web/LoginPanel.jsx":"0ae99a6b2b31","ui_kits/web/Primitives.jsx":"c5585a84acc7","ui_kits/web/data.jsx":"820195b552a7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.HostCleanersDesignSystem_90c5d5 = window.HostCleanersDesignSystem_90c5d5 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/web/CleanerProfileModal.jsx
try { (() => {
// Full public cleaner profile modal with review history.
function CleanerProfileModal({
  cleaner,
  onClose,
  onOffer
}) {
  if (!cleaner) return null;
  const areas = cleaner.areas.join(" · ");
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-backdrop",
    onClick: onClose,
    role: "presentation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-header"
  }, /*#__PURE__*/React.createElement("h2", null, "Cleaner profile"), /*#__PURE__*/React.createElement("button", {
    className: "modal-close",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "profile-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "profile-hero"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: cleaner.name,
    size: 72,
    className: "profile-avatar"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, cleaner.name, cleaner.kind === "agency" && /*#__PURE__*/React.createElement("span", {
    className: "cleaner-card-tag"
  }, "Agency")), /*#__PURE__*/React.createElement(RatingStars, {
    rating: cleaner.rating,
    count: cleaner.jobs,
    size: 16
  }), areas && /*#__PURE__*/React.createElement("p", {
    className: "profile-meta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin"
  }), " ", cleaner.city, " \xB7 ", areas))), cleaner.bio && /*#__PURE__*/React.createElement("p", {
    className: "profile-bio"
  }, cleaner.bio), /*#__PURE__*/React.createElement("dl", {
    className: "profile-facts"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "Experience"), /*#__PURE__*/React.createElement("dd", null, cleaner.exp)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "Languages"), /*#__PURE__*/React.createElement("dd", null, cleaner.languages)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("dt", null, "Transport"), /*#__PURE__*/React.createElement("dd", null, cleaner.car ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
    name: "car"
  }), " Own car") : "Public transport"))), /*#__PURE__*/React.createElement("div", {
    className: "profile-reviews"
  }, /*#__PURE__*/React.createElement("h4", null, "Reviews ", /*#__PURE__*/React.createElement("span", {
    className: "reviews-count"
  }, cleaner.reviews.length)), cleaner.reviews.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "muted-note",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "message-square"
  }), " No reviews yet.") : /*#__PURE__*/React.createElement("ul", {
    className: "review-list"
  }, cleaner.reviews.map(r => /*#__PURE__*/React.createElement("li", {
    className: "review-item",
    key: r.id
  }, /*#__PURE__*/React.createElement("div", {
    className: "review-item-head"
  }, /*#__PURE__*/React.createElement("strong", null, r.by), /*#__PURE__*/React.createElement(RatingStars, {
    rating: r.rating,
    size: 13,
    showValue: false
  })), /*#__PURE__*/React.createElement("p", null, r.text), /*#__PURE__*/React.createElement("span", {
    className: "review-item-date"
  }, r.date)))))), /*#__PURE__*/React.createElement("div", {
    className: "modal-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onOffer
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send"
  }), " Offer a job"))));
}
window.CleanerProfileModal = CleanerProfileModal;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/CleanerProfileModal.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/HostDashboard.jsx
try { (() => {
// Host dashboard — job lifecycle board with status badges and tabs.
const {
  useState: useStateHost
} = React;
function HostTopbar({
  tab,
  setTab,
  onLogout,
  counts
}) {
  const tabs = [{
    id: "jobs",
    label: "Jobs",
    icon: "calendar",
    count: counts.open
  }, {
    id: "properties",
    label: "Properties",
    icon: "home"
  }, {
    id: "cleaners",
    label: "Find cleaners",
    icon: "map-pin"
  }];
  return /*#__PURE__*/React.createElement("header", {
    className: "host-topbar"
  }, /*#__PURE__*/React.createElement("a", {
    className: "site-brand",
    href: "#"
  }, /*#__PURE__*/React.createElement(BrandMark, null)), /*#__PURE__*/React.createElement("nav", {
    className: "host-tabs"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: `host-tab ${tab === t.id ? "active" : ""}`,
    onClick: () => setTab(t.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: t.icon
  }), t.label, t.count > 0 && /*#__PURE__*/React.createElement("span", {
    className: "host-tab-count"
  }, t.count)))), /*#__PURE__*/React.createElement("div", {
    className: "header-actions"
  }, /*#__PURE__*/React.createElement("span", {
    className: "user-chip"
  }, "Ivan ", /*#__PURE__*/React.createElement("span", {
    className: "user-chip-dot"
  }, "\xB7"), " Host"), /*#__PURE__*/React.createElement("button", {
    className: "btn-text",
    onClick: onLogout
  }, "Log out")));
}
function JobCard({
  job
}) {
  const mod = job.status === "open" ? "open" : job.status === "assigned" ? "assigned" : job.status === "completed" ? "done" : "";
  return /*#__PURE__*/React.createElement("div", {
    className: `host-app-card host-app-card--${mod}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "host-app-card-left"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "host-app-job-title"
  }, job.title), /*#__PURE__*/React.createElement("div", {
    className: "host-app-job-meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "home"
  }), " ", job.property, " \xB7 ", job.city)), /*#__PURE__*/React.createElement("div", {
    className: "host-app-job-meta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar"
  }), " ", job.date, " \xB7 ", job.time)), (job.cleaner || job.applicants) && /*#__PURE__*/React.createElement("div", {
    className: "host-app-divider"
  }), job.cleaner ? /*#__PURE__*/React.createElement("div", {
    className: "host-cleaner-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "host-cleaner-avatar"
  }, window.KIT.initials(job.cleaner)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, job.cleaner), /*#__PURE__*/React.createElement("div", {
    className: "muted-note"
  }, job.status === "completed" ? "Completed this clean" : "Assigned cleaner"))) : job.applicants ? /*#__PURE__*/React.createElement("div", {
    className: "muted-note",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user-plus"
  }), " ", `${job.applicants} ${job.applicants === 1 ? "cleaner" : "cleaners"} applied`) : null), /*#__PURE__*/React.createElement("div", {
    className: "host-app-card-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "host-job-price"
  }, job.price), /*#__PURE__*/React.createElement(Badge, {
    status: job.status
  }), job.status === "open" && /*#__PURE__*/React.createElement("button", {
    className: "btn-text"
  }, "Review applicants"), job.status === "assigned" && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    style: {
      minHeight: 36,
      fontSize: 13,
      padding: "0 14px"
    }
  }, "View details")));
}
function HostDashboard({
  onLogout,
  onFindCleaners
}) {
  const [tab, setTab] = useStateHost("jobs");
  const jobs = window.KIT.HOST_JOBS;
  const open = jobs.filter(j => j.status === "open");
  const assigned = jobs.filter(j => j.status === "assigned");
  const completed = jobs.filter(j => j.status === "completed");
  React.useEffect(() => {
    if (tab === "cleaners") onFindCleaners();
  }, [tab]);
  return /*#__PURE__*/React.createElement("div", {
    className: "host-page"
  }, /*#__PURE__*/React.createElement(HostTopbar, {
    tab: tab,
    setTab: setTab,
    onLogout: onLogout,
    counts: {
      open: open.length
    }
  }), /*#__PURE__*/React.createElement("main", {
    className: "host-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "host-section-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "host-section-title"
  }, "Your cleaning jobs"), /*#__PURE__*/React.createElement("p", {
    className: "host-section-sub"
  }, "Post turnovers, review applicants, and track every clean.")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "send"
  }), " Post a job")), /*#__PURE__*/React.createElement("div", {
    className: "host-cards"
  }, open.length > 0 && /*#__PURE__*/React.createElement(SectionLabel, null, "Open \xB7 awaiting applicants"), open.map(j => /*#__PURE__*/React.createElement(JobCard, {
    key: j.id,
    job: j
  })), assigned.length > 0 && /*#__PURE__*/React.createElement(SectionLabel, null, "Assigned"), assigned.map(j => /*#__PURE__*/React.createElement(JobCard, {
    key: j.id,
    job: j
  })), completed.length > 0 && /*#__PURE__*/React.createElement(SectionLabel, null, "Completed"), completed.map(j => /*#__PURE__*/React.createElement(JobCard, {
    key: j.id,
    job: j
  })))));
}
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--muted)",
      marginTop: 8
    }
  }, children);
}
Object.assign(window, {
  HostDashboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/HostDashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Landing.jsx
try { (() => {
// Public landing: header, hero, and the reputation-first cleaner browser.
const {
  useState: useStateBrowser,
  useMemo
} = React;
function SiteHeader({
  onLogin
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "site-header"
  }, /*#__PURE__*/React.createElement("a", {
    className: "site-brand",
    href: "#"
  }, /*#__PURE__*/React.createElement(BrandMark, null)), /*#__PURE__*/React.createElement("div", {
    className: "header-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn-text",
    onClick: onLogin
  }, "Log in"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onLogin,
    style: {
      minHeight: 40,
      padding: "0 16px",
      fontSize: 14
    }
  }, "Sign up"), /*#__PURE__*/React.createElement("button", {
    className: "lang"
  }, "EN")));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-media",
    "aria-hidden": true
  }), /*#__PURE__*/React.createElement("div", {
    className: "hero-content"
  }, /*#__PURE__*/React.createElement("p", {
    className: "eyebrow"
  }, "Short-term rental turnover cleaning"), /*#__PURE__*/React.createElement("h1", null, "Find a verified cleaner near you"), /*#__PURE__*/React.createElement("p", {
    className: "hero-copy"
  }, "Browse trusted cleaners across Bulgaria. Filter by city and district, then open a profile to see ratings and reviews.")));
}
function CleanerCard({
  cleaner,
  onOpen
}) {
  const areas = cleaner.areas.slice(0, 2).join(", ");
  return /*#__PURE__*/React.createElement("button", {
    className: "listing-card",
    onClick: () => onOpen(cleaner)
  }, /*#__PURE__*/React.createElement("div", {
    className: "listing-cover"
  }, /*#__PURE__*/React.createElement("img", {
    src: cleaner.cover,
    alt: "",
    loading: "lazy"
  }), cleaner.kind === "agency" && /*#__PURE__*/React.createElement("span", {
    className: "listing-badge"
  }, "Agency")), /*#__PURE__*/React.createElement("div", {
    className: "listing-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "listing-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "listing-name"
  }, cleaner.name), cleaner.rating > 0 && /*#__PURE__*/React.createElement("span", {
    className: "listing-rating"
  }, /*#__PURE__*/React.createElement("span", {
    className: "listing-star"
  }, "\u2605"), cleaner.rating.toFixed(1))), /*#__PURE__*/React.createElement("span", {
    className: "listing-meta"
  }, cleaner.city, areas ? ` · ${areas}` : ""), /*#__PURE__*/React.createElement("span", {
    className: "listing-sub"
  }, cleaner.jobs > 0 ? `${cleaner.jobs} jobs · ${cleaner.exp}` : `New · ${cleaner.exp}`)));
}
function CleanerBrowser({
  onOpen
}) {
  const [city, setCity] = useStateBrowser("");
  const cleaners = window.KIT.CLEANERS;
  const filtered = useMemo(() => city ? cleaners.filter(c => c.city === city) : cleaners, [city]);
  return /*#__PURE__*/React.createElement("div", {
    className: "cleaner-browser"
  }, /*#__PURE__*/React.createElement("div", {
    className: "browser-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "browser-title"
  }, "Cleaners ", city ? `in ${city}` : "across Bulgaria"), /*#__PURE__*/React.createElement("span", {
    className: "cb-count"
  }, `${filtered.length} ${filtered.length === 1 ? "cleaner" : "cleaners"} available`)), /*#__PURE__*/React.createElement("div", {
    className: "cleaner-browser-filters"
  }, /*#__PURE__*/React.createElement("label", {
    className: "cb-field"
  }, /*#__PURE__*/React.createElement("span", null, "City"), /*#__PURE__*/React.createElement("select", {
    value: city,
    onChange: e => setCity(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "All cities"), window.KIT.CITIES.map(c => /*#__PURE__*/React.createElement("option", {
    key: c,
    value: c
  }, c)))), /*#__PURE__*/React.createElement("label", {
    className: "cb-field"
  }, /*#__PURE__*/React.createElement("span", null, "District"), /*#__PURE__*/React.createElement("select", {
    disabled: !city
  }, /*#__PURE__*/React.createElement("option", null, city ? "All districts" : "Any"))), city && /*#__PURE__*/React.createElement("button", {
    className: "cb-clear",
    onClick: () => setCity("")
  }, "Clear"))), /*#__PURE__*/React.createElement("div", {
    className: "cleaners-grid"
  }, filtered.map(c => /*#__PURE__*/React.createElement(CleanerCard, {
    key: c.id,
    cleaner: c,
    onOpen: onOpen
  }))));
}
Object.assign(window, {
  SiteHeader,
  Hero,
  CleanerCard,
  CleanerBrowser
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Landing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/LoginPanel.jsx
try { (() => {
// Session login screen — matches the product's /login.
const {
  useState: useStateLogin
} = React;
function LoginPanel({
  onSignedIn,
  onBack
}) {
  const [email, setEmail] = useStateLogin("host@example.bg");
  const [pw, setPw] = useStateLogin("");
  return /*#__PURE__*/React.createElement("main", {
    className: "auth-page"
  }, /*#__PURE__*/React.createElement("section", {
    className: "auth-panel"
  }, /*#__PURE__*/React.createElement("a", {
    className: "site-brand",
    href: "#",
    onClick: e => {
      e.preventDefault();
      onBack();
    }
  }, /*#__PURE__*/React.createElement("img", {
    className: "brand-mark",
    src: "../../assets/mark.svg",
    width: "34",
    height: "34",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", null, "Host Cleaners")), /*#__PURE__*/React.createElement("div", {
    className: "auth-heading"
  }, /*#__PURE__*/React.createElement("h1", null, "Log in"), /*#__PURE__*/React.createElement("p", null, "Use the email and password from your signup request.")), /*#__PURE__*/React.createElement("form", {
    className: "auth-form",
    onSubmit: e => {
      e.preventDefault();
      onSignedIn();
    }
  }, /*#__PURE__*/React.createElement("label", null, /*#__PURE__*/React.createElement("span", null, "Email"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    autoComplete: "email"
  })), /*#__PURE__*/React.createElement("label", null, /*#__PURE__*/React.createElement("span", null, "Password"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: pw,
    onChange: e => setPw(e.target.value),
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    autoComplete: "current-password"
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-block",
    type: "submit"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-in"
  }), " Sign in"), /*#__PURE__*/React.createElement("div", {
    className: "auth-divider"
  }, /*#__PURE__*/React.createElement("span", null, "OR")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-block",
    type: "button"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user-plus"
  }), " Create an account"))));
}
window.LoginPanel = LoginPanel;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/LoginPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Primitives.jsx
try { (() => {
// Small shared presentational components for the Host Cleaners UI kit.
const {
  useState
} = React;
function Icon({
  name,
  className
}) {
  // Lucide is loaded globally; render a placeholder <i> that lucide replaces.
  return /*#__PURE__*/React.createElement("i", {
    "data-lucide": name,
    className: className
  });
}
function RatingStars({
  rating,
  count,
  size = 14,
  showValue = true
}) {
  const rounded = Math.round(rating || 0);
  return /*#__PURE__*/React.createElement("span", {
    className: "rating-stars"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rating-stars-row",
    style: {
      fontSize: size
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    className: n <= rounded ? "host-star--on" : "host-star--off",
    style: {
      fontSize: size
    }
  }, "\u2605"))), showValue && /*#__PURE__*/React.createElement("span", {
    className: "rating-stars-value"
  }, rating > 0 ? rating.toFixed(1) : "New", count > 0 && /*#__PURE__*/React.createElement("span", {
    className: "rating-stars-count"
  }, " \xB7 ", count, " job", count === 1 ? "" : "s")));
}
function Avatar({
  name,
  size = 56,
  className = "cleaner-card-avatar"
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      width: size,
      height: size,
      fontSize: size * 0.32
    }
  }, window.KIT.initials(name));
}
function BrandMark({
  label = true
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "site-brand"
  }, /*#__PURE__*/React.createElement("img", {
    className: "brand-mark",
    src: "../../assets/mark.svg",
    width: "34",
    height: "34",
    alt: ""
  }), label && /*#__PURE__*/React.createElement("span", null, "Host Cleaners"));
}
function Badge({
  status
}) {
  const map = {
    draft: ["b-draft", "Draft"],
    open: ["b-open", "Open"],
    assigned: ["b-assigned", "Assigned"],
    completed: ["b-completed", "Completed"]
  };
  const [cls, label] = map[status] || ["b-draft", status];
  return /*#__PURE__*/React.createElement("span", {
    className: `badge ${cls}`
  }, label);
}
Object.assign(window, {
  Icon,
  RatingStars,
  Avatar,
  BrandMark,
  Badge
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Primitives.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/data.jsx
try { (() => {
// Shared sample data + tiny helpers for the Host Cleaners UI kit.
function initials(name) {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p[1]?.[0] ?? "")).toUpperCase() : "?";
}
const CLEANERS = [{
  id: 1,
  cover: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
  name: "Maria Dimitrova",
  kind: "agency",
  rating: 4.9,
  jobs: 32,
  areas: ["Lozenets", "Oborishte", "Centre"],
  city: "Sofia",
  exp: "5+ years",
  languages: "Bulgarian, English, Russian",
  car: true,
  bio: "Sparkle Turnovers — a small Sofia agency specialising in same-day Airbnb turnovers. We bring our own supplies and send before/after photos on every clean.",
  reviews: [{
    id: 1,
    by: "Ivan P.",
    rating: 5,
    date: "May 2026",
    text: "Flawless turnover between two back-to-back guests. Photos sent within the hour."
  }, {
    id: 2,
    by: "Elena T.",
    rating: 5,
    date: "Apr 2026",
    text: "Reliable and communicative. My go-to for the Lozenets flat."
  }]
}, {
  id: 2,
  cover: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
  name: "Georgi Petrov",
  kind: "cleaner",
  rating: 4.7,
  jobs: 18,
  areas: ["Mladost", "Studentski"],
  city: "Sofia",
  exp: "3 years",
  languages: "Bulgarian, English",
  car: true,
  bio: "Detail-focused independent cleaner. Flexible on tight check-in windows and happy to handle linen changes.",
  reviews: [{
    id: 1,
    by: "Nadia K.",
    rating: 5,
    date: "May 2026",
    text: "On time, thorough, great with last-minute bookings."
  }]
}, {
  id: 3,
  cover: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
  name: "Yana Stoyanova",
  kind: "cleaner",
  rating: 5.0,
  jobs: 41,
  areas: ["Sea Garden", "Centre"],
  city: "Varna",
  exp: "5+ years",
  languages: "Bulgarian, English, German",
  car: false,
  bio: "Varna-based turnover specialist for seaside apartments. Calm, fast, and meticulous about kitchen and bathroom detail.",
  reviews: [{
    id: 1,
    by: "Dimitar V.",
    rating: 5,
    date: "May 2026",
    text: "Best cleaner I've worked with all season. Guests keep mentioning how spotless the flat is."
  }, {
    id: 2,
    by: "Sofia M.",
    rating: 5,
    date: "Mar 2026",
    text: "Absolutely dependable through the busy months."
  }]
}, {
  id: 4,
  cover: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80",
  name: "Plamen Iliev",
  kind: "cleaner",
  rating: 4.5,
  jobs: 9,
  areas: ["Kamenitza", "Centre"],
  city: "Plovdiv",
  exp: "2 years",
  languages: "Bulgarian",
  car: true,
  bio: "Plovdiv old-town turnovers. Friendly, punctual, and good with the steep stairwells nobody else wants.",
  reviews: [{
    id: 1,
    by: "Rosen A.",
    rating: 4,
    date: "Apr 2026",
    text: "Solid work and easy to reach."
  }]
}, {
  id: 5,
  cover: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80",
  name: "Desislava Koleva",
  kind: "cleaner",
  rating: 0,
  jobs: 0,
  areas: ["Bansko Centre"],
  city: "Bansko",
  exp: "1 year",
  languages: "Bulgarian, English",
  car: true,
  bio: "New to the platform — ski-season turnover cleaner in Bansko. Available on short notice through the winter.",
  reviews: []
}, {
  id: 6,
  cover: "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&w=900&q=80",
  name: "CleanCoast Agency",
  kind: "agency",
  rating: 4.8,
  jobs: 27,
  areas: ["Sea Garden", "Asparuhovo"],
  city: "Burgas",
  exp: "5+ years",
  languages: "Bulgarian, English",
  car: true,
  bio: "Burgas coastal agency covering multiple properties per day. Linen service and consumables restocking available as add-ons.",
  reviews: [{
    id: 1,
    by: "Petya G.",
    rating: 5,
    date: "May 2026",
    text: "Handled five of our flats through peak week without a single slip."
  }]
}];
const CITIES = ["Sofia", "Plovdiv", "Varna", "Burgas", "Bansko"];
const HOST_JOBS = [{
  id: 1,
  title: "Turnover cleaning",
  property: "Lozenets Studio",
  city: "Sofia",
  date: "Sat 7 Jun",
  time: "11:00 – 14:00",
  price: "€55",
  status: "assigned",
  cleaner: "Maria Dimitrova"
}, {
  id: 2,
  title: "Deep clean + linen",
  property: "Sea Garden Apt",
  city: "Varna",
  date: "Sun 8 Jun",
  time: "10:00 – 13:30",
  price: "€70",
  status: "open",
  applicants: 4
}, {
  id: 3,
  title: "Turnover cleaning",
  property: "Old Town Loft",
  city: "Plovdiv",
  date: "Mon 9 Jun",
  time: "12:00 – 14:00",
  price: "€45",
  status: "open",
  applicants: 2
}, {
  id: 4,
  title: "Turnover cleaning",
  property: "Lozenets Studio",
  city: "Sofia",
  date: "Tue 3 Jun",
  time: "11:00 – 14:00",
  price: "€55",
  status: "completed",
  cleaner: "Maria Dimitrova"
}, {
  id: 5,
  title: "Checkout clean",
  property: "Mladost 2BR",
  city: "Sofia",
  date: "Wed 4 Jun",
  time: "11:00 – 13:00",
  price: "€48",
  status: "completed",
  cleaner: "Georgi Petrov"
}];
window.KIT = {
  initials,
  CLEANERS,
  CITIES,
  HOST_JOBS
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/data.jsx", error: String((e && e.message) || e) }); }

})();

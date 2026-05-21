"use client";

import { FormEvent, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Home as HomeIcon,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";

type Audience = "host" | "cleaner";
type Language = "BG" | "EN";

const popularMarkets = ["Sofia", "Plovdiv", "Varna", "Burgas", "Bansko"];

const featuredCleaners = [
  {
    name: "Mira Cleaning",
    area: "Sofia",
    type: "Agency",
    rating: "4.9",
    image:
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Sea Turnovers",
    area: "Varna and Burgas",
    type: "Agency",
    rating: "4.8",
    image:
      "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Elena Petrova",
    area: "Plovdiv",
    type: "Individual",
    rating: "New",
    image:
      "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
  },
];

const steps = [
  {
    title: "Post the turnover",
    body: "Add one cleaning or generate a month of jobs from your property calendar.",
    icon: CalendarDays,
  },
  {
    title: "Choose verified supply",
    body: "Cleaners and agencies apply with availability, notes, and agreed pricing.",
    icon: ShieldCheck,
  },
  {
    title: "Share the schedule",
    body: "Keep hosts and cleaners aligned with app calendar, Google sync, and iCal feeds.",
    icon: UserRoundCheck,
  },
];


export default function Home() {
  const [audience, setAudience] = useState<Audience>("host");
  const [city, setCity] = useState("Sofia");
  const [month, setMonth] = useState("");
  const [properties, setProperties] = useState("3");
  const [language, setLanguage] = useState<Language>("EN");
  const [showMenu, setShowMenu] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadMessage("");
    setLoading(true);
    setResults([]);
    try {
      // Placeholder: Replace with your real API endpoint
      // Example: `/api/cleaners?city=${city}&month=${month}`
      // For now, filter featuredCleaners as a demo
      let filtered = featuredCleaners.filter((cleaner) =>
        cleaner.area.toLowerCase().includes(city.toLowerCase())
      );
      // Simulate network delay
      await new Promise((res) => setTimeout(res, 500));
      setResults(filtered);
      if (filtered.length === 0) {
        setLeadMessage("No cleaners found for your search.");
      }
    } catch (err) {
      setLeadMessage("Error fetching results.");
    }
    setLoading(false);
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="site-brand" href="#top" aria-label="Host Cleaners home">
          <span className="brand-symbol">
            <HomeIcon size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </a>

        <nav className={`site-nav ${showMenu ? "open" : ""}`} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#cleaners">Cleaners</a>
          <a href="#trust">Trust</a>
        </nav>

        <div className="header-actions">
          <a className="text-link login-link" href="/login">
            Log in
          </a>
          <label className="language-picker" aria-label="Language">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="EN">EN</option>
              <option value="BG">BG</option>
            </select>
          </label>
          <button
            className="menu-button"
            type="button"
            aria-label="Toggle menu"
            onClick={() => setShowMenu((value) => !value)}
          >
            {showMenu ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <p className="eyebrow">Short-term rental turnover cleaning</p>
          <h1>Cleaners for Airbnb turnovers in Bulgaria</h1>
          <p className="hero-copy">
            Post single cleanings or a full month of jobs, compare verified cleaners and agencies,
            and keep both sides aligned through shared calendars.
          </p>

          <form className="search-panel" onSubmit={submitSearch}>
            <div className="audience-tabs" role="tablist" aria-label="Audience">
              <button
                aria-selected={audience === "host"}
                className={audience === "host" ? "selected" : ""}
                onClick={() => setAudience("host")}
                role="tab"
                type="button"
              >
                I host properties
              </button>
              <button
                aria-selected={audience === "cleaner"}
                className={audience === "cleaner" ? "selected" : ""}
                onClick={() => setAudience("cleaner")}
                role="tab"
                type="button"
              >
                I clean properties
              </button>
            </div>

            <div className="search-fields">
              <label>
                <span>Where</span>
                <select value={city} onChange={(event) => setCity(event.target.value)}>
                  {popularMarkets.map((market) => (
                    <option key={market}>{market}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>When</span>
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              </label>
              <label>
                <span>{audience === "host" ? "Properties" : "Capacity"}</span>
                <input
                  inputMode="numeric"
                  value={properties}
                  onChange={(event) => setProperties(event.target.value)}
                  placeholder={audience === "host" ? "3" : "12 jobs"}
                />
              </label>
              <button className="search-button" type="submit" aria-label="Search">
                <Search size={18} aria-hidden />
                <span>Search</span>
              </button>
            </div>
          </form>

          {leadMessage ? <p className="lead-message">{leadMessage}</p> : null}
          {loading && <p>Loading...</p>}
          {results.length > 0 && (
            <div className="search-results">
              <h3>Available Cleaners</h3>
              <ul>
                {results.map((cleaner) => (
                  <li key={cleaner.name}>
                    <strong>{cleaner.name}</strong> ({cleaner.area}) - {cleaner.type} | Rating: {cleaner.rating}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="market-strip" aria-label="Launch markets">
        <span>Launching across Bulgaria</span>
        <div>
          {popularMarkets.map((market) => (
            <a href="#cleaners" key={market}>
              <MapPin size={15} aria-hidden />
              {market}
            </a>
          ))}
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">For hosts and cleaners</p>
          <h2>One shared workflow for reliable turnovers</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <article className="feature-card" key={step.title}>
                <Icon size={24} aria-hidden />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section featured-section" id="cleaners">
        <div className="section-heading">
          <p className="eyebrow">Verified supply</p>
          <h2>Cleaner and agency profiles built for trust</h2>
        </div>
        <div className="cleaner-gallery">
          {featuredCleaners.map((cleaner) => (
            <article className="cleaner-card" key={cleaner.name}>
              <div
                aria-label={`${cleaner.name} cleaning service`}
                className="cleaner-card-image"
                role="img"
                style={{ backgroundImage: `url(${cleaner.image})` }}
              />
              <div>
                <h3>{cleaner.name}</h3>
                <p>{cleaner.area}</p>
                <span>
                  <Star size={15} aria-hidden />
                  {cleaner.rating} - {cleaner.type}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-band" id="trust">
        <div>
          <p className="eyebrow">Quality controls</p>
          <h2>Designed around verified cleaners, visible history, and two-way feedback.</h2>
        </div>
        <div className="trust-list">
          <span>
            <ShieldCheck size={18} aria-hidden />
            Manual cleaner approval
          </span>
          <span>
            <CalendarDays size={18} aria-hidden />
            Google and iCal direction
          </span>
          <span>
            <Star size={18} aria-hidden />
            Reviews after completed work
          </span>
          <span>
            <CheckCircle2 size={18} aria-hidden />
            No in-app payments in v1
          </span>
        </div>
      </section>

      <section className="join-section" id="join">
        <div>
          <p className="eyebrow">Early access</p>
          <h2>Start with your next turnover schedule.</h2>
          <p>
            Hosts can prepare cleaning demand. Cleaners and agencies can join the verified supply
            network before the public marketplace opens.
          </p>
        </div>
        <div className="join-actions">
          <a className="primary-link" href="#top">
            Find cleaners
            <ChevronRight size={18} aria-hidden />
          </a>
          <a className="secondary-link" href="/signup">
            Create account
            <Users size={18} aria-hidden />
          </a>
        </div>
      </section>
    </main>
  );
}

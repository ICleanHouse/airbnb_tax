"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Home as HomeIcon,
  LayoutDashboard,
  MapPin,
  ShieldCheck as AdminIcon,
  Star,
} from "lucide-react";
import { apiFetch, CurrentUser, roleLabel } from "../lib/api";
import CleanerBrowser from "./components/CleanerBrowser";
import AudienceToggle, { type Audience } from "../components/AudienceToggle";
import AreaDemandPanel from "../components/AreaDemandPanel";

type Language = "BG" | "EN";

export default function Home() {
  const [language, setLanguage] = useState<Language>("EN");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [audience, setAudience] = useState<Audience>("host");

  // Initialise the audience from the ?as= URL param (shareable / deep-linkable).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("as");
    if (param === "cleaner" || param === "host") setAudience(param);
  }, []);

  function changeAudience(next: Audience) {
    setAudience(next);
    const url = new URL(window.location.href);
    url.searchParams.set("as", next);
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    apiFetch("/api/accounts/me/", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CurrentUser | null) => setCurrentUser(data))
      .catch(() => null)
      .finally(() => window.clearTimeout(timeoutId));

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  async function handleLogout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    setCurrentUser(null);
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

        <div className="header-actions">
          {currentUser ? (
            <>
              {currentUser.is_platform_admin ? (
                <a className="text-link" href="/admin">
                  <AdminIcon size={15} aria-hidden />
                  Admin panel
                </a>
              ) : currentUser.role === "host" ? (
                <a className="text-link" href="/host">
                  <LayoutDashboard size={15} aria-hidden />
                  Dashboard
                </a>
              ) : currentUser.role === "cleaner" ? (
                <a className="text-link" href="/cleaner">
                  <LayoutDashboard size={15} aria-hidden />
                  Dashboard
                </a>
              ) : (
                <a className="text-link" href="/app">
                  <LayoutDashboard size={15} aria-hidden />
                  Dashboard
                </a>
              )}
              <span className="user-chip">
                {currentUser.first_name || currentUser.email.split("@")[0]}
                <span className="user-chip-dot" aria-hidden>·</span>
                {currentUser.is_platform_admin ? "Admin" : roleLabel(currentUser.role)}
              </span>
              <button
                className="text-link logout-trigger"
                type="button"
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <a className="text-link login-link" href="/login">
                Log in
              </a>
              <a className="primary-link" href={`/signup?role=${audience}`}>
                Sign up
              </a>
            </>
          )}
          <label className="language-picker" aria-label="Language">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="EN">EN</option>
              <option value="BG">BG</option>
            </select>
          </label>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-inner">
          <p className="eyebrow">Short-term rental turnover cleaning · Bulgaria</p>
          <h1>
            {audience === "host"
              ? "Find a verified cleaner near you"
              : "Find cleaning work near you"}
          </h1>
          <p className="landing-hero-copy">
            {audience === "host"
              ? "Browse trusted cleaners across Bulgaria. Filter by city and district, then open a profile to see ratings and reviews."
              : "See how many hosts are hiring in your area and join the verified cleaner network — free."}
          </p>
          <div className="landing-hero-chips">
            <span className="trust-chip">
              <Check size={14} aria-hidden /> Verified cleaners
            </span>
            <span className="trust-chip">
              <Star size={14} aria-hidden /> Rated &amp; reviewed
            </span>
            <span className="trust-chip">
              <MapPin size={14} aria-hidden /> Across Bulgaria
            </span>
          </div>
          <AudienceToggle value={audience} onChange={changeAudience} />
        </div>
      </section>

      <section className="landing-directory" id="cleaners">
        {audience === "host" ? <CleanerBrowser /> : <AreaDemandPanel />}
      </section>
    </main>
  );
}

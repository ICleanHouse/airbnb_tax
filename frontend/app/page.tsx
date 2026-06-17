"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Home as HomeIcon,
  LayoutDashboard,
  LogOut,
  MapPin,
  ShieldCheck as AdminIcon,
  Star,
  User,
  UserRoundCheck,
} from "lucide-react";
import { apiFetch, CurrentUser, roleLabel } from "../lib/api";
import CleanerBrowser from "../components/CleanerBrowser";
import AudienceToggle, { type Audience } from "../components/AudienceToggle";
import AreaDemandPanel from "../components/AreaDemandPanel";
import NotificationBell from "../components/NotificationBell";

type Language = "BG" | "EN";

export default function Home() {
  const [language, setLanguage] = useState<Language>("EN");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [audience, setAudience] = useState<Audience>("host");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeAccountMenu(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeAccountMenu);
    return () => document.removeEventListener("mousedown", closeAccountMenu);
  }, [accountMenuOpen]);

  async function handleLogout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    setCurrentUser(null);
    setAccountMenuOpen(false);
  }

  async function changePreferredLanguage(preferredLanguage: "bg" | "en") {
    if (!currentUser) return;
    const response = await apiFetch(`/api/accounts/users/${currentUser.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ preferred_language: preferredLanguage }),
    });
    if (response.ok) {
      setCurrentUser((await response.json()) as CurrentUser);
    }
  }

  const dashboardHref = currentUser?.is_platform_admin
    ? "/admin"
    : currentUser?.role === "host"
      ? "/host"
      : currentUser?.role === "cleaner"
        ? "/cleaner"
        : "/app";
  const profileHref = currentUser?.role === "host"
    ? "/host?section=account"
    : currentUser?.role === "cleaner"
      ? "/cleaner?section=profile"
      : dashboardHref;

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
                <a className="text-link" href={dashboardHref}>
                  <AdminIcon size={15} aria-hidden />
                  Admin panel
                </a>
              ) : (
                <a className="text-link" href={dashboardHref}>
                  <LayoutDashboard size={15} aria-hidden />
                  Dashboard
                </a>
              )}
              <NotificationBell />
              <div className="cleaner-account-menu" ref={accountMenuRef}>
                <button
                  className="cleaner-account-menu-trigger"
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  aria-label="Account menu"
                >
                  <User size={18} aria-hidden />
                </button>
                {accountMenuOpen ? (
                  <div className="cleaner-account-menu-dropdown" role="menu" aria-label="Account menu">
                    <div className="cleaner-account-menu-identity">
                      <strong>
                        {`${currentUser.first_name} ${currentUser.last_name}`.trim()
                          || currentUser.email.split("@")[0]}
                      </strong>
                      <span>{currentUser.is_platform_admin ? "Admin" : roleLabel(currentUser.role)}</span>
                    </div>
                    <a className="cleaner-account-menu-item" href={profileHref} role="menuitem">
                      <UserRoundCheck size={16} aria-hidden />
                      Profile
                    </a>
                    <div className="account-language-picker">
                      <span>Language</span>
                      <div className="account-language-slider" role="group" aria-label="Language">
                        <button
                          type="button"
                          className={currentUser.preferred_language === "bg" ? "active" : ""}
                          aria-pressed={currentUser.preferred_language === "bg"}
                          onClick={() => void changePreferredLanguage("bg")}
                        >
                          BG
                        </button>
                        <button
                          type="button"
                          className={currentUser.preferred_language === "en" ? "active" : ""}
                          aria-pressed={currentUser.preferred_language === "en"}
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
                      onClick={() => void handleLogout()}
                    >
                      <LogOut size={16} aria-hidden />
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
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
          {!currentUser ? (
            <label className="language-picker" aria-label="Language">
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                <option value="EN">EN</option>
                <option value="BG">BG</option>
              </select>
            </label>
          ) : null}
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
        {audience === "host" ? <CleanerBrowser /> : <AreaDemandPanel currentUser={currentUser} />}
      </section>
    </main>
  );
}

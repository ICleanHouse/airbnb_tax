"use client";

import { useEffect, useState } from "react";
import {
  Home as HomeIcon,
  LayoutDashboard,
  ShieldCheck as AdminIcon,
} from "lucide-react";
import { apiFetch, CurrentUser, roleLabel } from "../lib/api";
import CleanerBrowser from "./components/CleanerBrowser";

type Language = "BG" | "EN";

export default function Home() {
  const [language, setLanguage] = useState<Language>("EN");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

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
              <a className="primary-link" href="/signup">
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

      <section className="hero hero--compact" id="top">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <p className="eyebrow">Short-term rental turnover cleaning</p>
          <h1>Find a verified cleaner near you</h1>
          <p className="hero-copy">
            Browse trusted cleaners across Bulgaria. Filter by city and district, then
            open a profile to see ratings and reviews.
          </p>
        </div>
      </section>

      <section className="landing-directory" id="cleaners">
        <CleanerBrowser />
      </section>
    </main>
  );
}

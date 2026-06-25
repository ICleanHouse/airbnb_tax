"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter, usePathname } from "../../i18n/navigation";
import { apiFetch, CurrentUser, roleLabel } from "../../lib/api";
import CleanerBrowser from "../../components/CleanerBrowser";
import AudienceToggle, { type Audience } from "../../components/AudienceToggle";
import AreaDemandPanel from "../../components/AreaDemandPanel";
import NotificationBell from "../../components/NotificationBell";

export default function Home() {
  const tNav = useTranslations("nav");
  const tLanding = useTranslations("landing");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [audience, setAudience] = useState<Audience>("host");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Restore cached user before first paint so there is no flash of the wrong UI.
  useLayoutEffect(() => {
    try {
      const hint = localStorage.getItem("hc_user_hint");
      if (hint) {
        setCurrentUser(JSON.parse(hint) as CurrentUser);
        setAuthChecked(true);
      }
    } catch {
      // ignore
    }
  }, []);

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
      .then((data: CurrentUser | null) => {
        setCurrentUser(data);
        if (data) {
          localStorage.setItem("hc_user_hint", JSON.stringify(data));
        } else {
          localStorage.removeItem("hc_user_hint");
        }
      })
      .catch(() => null)
      .finally(() => {
        setAuthChecked(true);
        window.clearTimeout(timeoutId);
      });

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
    localStorage.removeItem("hc_user_hint");
    setCurrentUser(null);
    setAccountMenuOpen(false);
  }

  function switchLocale(next: "bg" | "en") {
    router.replace(pathname, { locale: next });
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
    switchLocale(preferredLanguage);
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
        <a className="site-brand" href="#top" aria-label={tNav("brandAriaLabel")}>
          <span className="brand-symbol">
            <HomeIcon size={18} aria-hidden />
          </span>
          <strong>{tNav("brandName")}</strong>
        </a>

        <div className="header-actions">
          {authChecked && currentUser ? (
            <>
              {currentUser.is_platform_admin ? (
                <a className="text-link" href={dashboardHref}>
                  <AdminIcon size={15} aria-hidden />
                  {tNav("adminPanel")}
                </a>
              ) : (
                <a className="text-link" href={dashboardHref}>
                  <LayoutDashboard size={15} aria-hidden />
                  {tNav("dashboard")}
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
                  aria-label={tNav("accountMenuAriaLabel")}
                >
                  <User size={18} aria-hidden />
                </button>
                {accountMenuOpen ? (
                  <div className="cleaner-account-menu-dropdown" role="menu" aria-label={tNav("accountMenuAriaLabel")}>
                    <div className="cleaner-account-menu-identity">
                      <strong>
                        {`${currentUser.first_name} ${currentUser.last_name}`.trim()
                          || currentUser.email.split("@")[0]}
                      </strong>
                      <span>{currentUser.is_platform_admin ? tNav("adminRole") : roleLabel(currentUser.role)}</span>
                    </div>
                    <a className="cleaner-account-menu-item" href={profileHref} role="menuitem">
                      <UserRoundCheck size={16} aria-hidden />
                      {tNav("profile")}
                    </a>
                    <div className="account-language-picker">
                      <span>{tNav("language")}</span>
                      <div className="account-language-slider" role="group" aria-label={tNav("language")}>
                        <button
                          type="button"
                          className={locale === "bg" ? "active" : ""}
                          aria-pressed={locale === "bg"}
                          onClick={() => void changePreferredLanguage("bg")}
                        >
                          BG
                        </button>
                        <button
                          type="button"
                          className={locale === "en" ? "active" : ""}
                          aria-pressed={locale === "en"}
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
                      {tNav("logOut")}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : authChecked ? (
            <>
              <Link className="text-link login-link" href="/login">
                {tNav("logIn")}
              </Link>
              <Link className="primary-link" href={`/signup?role=${audience}`}>
                {tNav("signUp")}
              </Link>
            </>
          ) : null}
          {authChecked && !currentUser ? (
            <label className="language-picker" aria-label={tNav("language")}>
              <select
                value={locale}
                onChange={(e) => switchLocale(e.target.value as "bg" | "en")}
              >
                <option value="en">EN</option>
                <option value="bg">BG</option>
              </select>
            </label>
          ) : null}
        </div>
      </header>

      {authChecked && currentUser ? (
        <>
          <section className="home-hero" id="top">
            <div className="home-hero-inner">
              <p className="eyebrow">
                {currentUser.first_name
                  ? tLanding("welcomeBackNamed", { name: currentUser.first_name })
                  : tLanding("welcomeBack")}
              </p>
              <h1>
                {currentUser.role === "cleaner"
                  ? tLanding("loggedInCleanerHeading")
                  : tLanding("loggedInHostHeading")}
              </h1>
            </div>
          </section>

          <section className="landing-directory" id="browse">
            {currentUser.role === "cleaner" ? (
              <AreaDemandPanel currentUser={currentUser} />
            ) : (
              <CleanerBrowser />
            )}
          </section>
        </>
      ) : authChecked ? (
        <>
          <section className="landing-hero" id="top">
            <div className="landing-hero-inner">
              <p className="eyebrow">{tLanding("eyebrow")}</p>
              <h1>
                {audience === "host"
                  ? tLanding("heroHostHeading")
                  : tLanding("heroCleanerHeading")}
              </h1>
              <p className="landing-hero-copy">
                {audience === "host"
                  ? tLanding("heroHostCopy")
                  : tLanding("heroCleanerCopy")}
              </p>
              <div className="landing-hero-chips">
                <span className="trust-chip">
                  <Check size={14} aria-hidden /> {tLanding("chipVerified")}
                </span>
                <span className="trust-chip">
                  <Star size={14} aria-hidden /> {tLanding("chipRated")}
                </span>
                <span className="trust-chip">
                  <MapPin size={14} aria-hidden /> {tLanding("chipBulgaria")}
                </span>
              </div>
              <AudienceToggle value={audience} onChange={changeAudience} />
            </div>
          </section>

          <section className="landing-directory" id="cleaners">
            {audience === "host" ? <CleanerBrowser /> : <AreaDemandPanel currentUser={currentUser} />}
          </section>
        </>
      ) : null}
    </main>
  );
}
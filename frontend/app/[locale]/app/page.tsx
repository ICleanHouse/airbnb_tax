"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Clock3, LogOut, ShieldCheck, ShieldAlert, UserRoundCog } from "lucide-react";
import { CurrentUser, apiFetch } from "../../../lib/api";
import AccountDeletionPanel from "../../../components/AccountDeletionPanel";
import VerificationStatusSummary from "../../../components/VerificationStatusSummary";
import { postAuthDestination, type AppLocale } from "../../../lib/redirects";

export default function AppEntryPage() {
  const t = useTranslations("app");
  const locale = useLocale() as AppLocale;
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function statusCopy(u: CurrentUser) {
    const role = ["host", "cleaner", "agency", "admin"].includes(u.role)
      ? t(`roleLabels.${u.role}` as Parameters<typeof t>[0])
      : t("roleLabels.unknown");
    if (u.account_status === "approved") {
      return { role, title: t("statusCopy.approved.title", { role }), body: t("statusCopy.approved.body"), icon: CheckCircle2 };
    }
    if (u.account_status === "rejected") {
      return { role, title: t("statusCopy.rejected.title"), body: t("statusCopy.rejected.body"), icon: ShieldAlert };
    }
    if (u.account_status === "suspended") {
      return { role, title: t("statusCopy.suspended.title"), body: t("statusCopy.suspended.body"), icon: ShieldAlert };
    }
    if (u.account_status === "pending") {
      return { role, title: t("statusCopy.pending.title"), body: t("statusCopy.pending.body"), icon: Clock3 };
    }
    return { role, title: t("statusCopy.unavailable.title"), body: t("statusCopy.unavailable.body"), icon: ShieldAlert };
  }

  const loadUser = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await apiFetch("/api/accounts/me/");
      if (response.ok) {
        const data = (await response.json()) as CurrentUser;
        if (data.is_platform_admin || data.account_status === "approved" || data.account_status === "pending") {
          window.location.replace(postAuthDestination(data, null, locale));
          return;
        }
        setUser(data);
      } else if (response.status !== 401 && response.status !== 403) {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!loading && (user || loadError)) headingRef.current?.focus();
  }, [loadError, loading, user]);

  async function logout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="app-page">
        <section className="app-shell">
          <p className="eyebrow">{t("loading.eyebrow")}</p>
          <h1>{t("loading.heading")}</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    if (loadError) {
      return (
        <main className="app-page">
          <section className="app-shell" aria-live="polite">
            <p className="eyebrow">{t("loadError.eyebrow")}</p>
            <h1 ref={headingRef} tabIndex={-1}>{t("loadError.heading")}</h1>
            <p>{t("loadError.body")}</p>
            <button type="button" className="primary-link" onClick={() => void loadUser()}>
              {t("loadError.retry")}
            </button>
          </section>
        </main>
      );
    }
    return (
      <main className="app-page">
        <section className="app-shell">
          <p className="eyebrow">{t("notLoggedIn.eyebrow")}</p>
            <h1>{t("notLoggedIn.heading")}</h1>
          <div className="join-actions">
            <Link className="primary-link" href="/login">
              {t("notLoggedIn.loginBtn")}
            </Link>
            <Link className="secondary-link" href="/signup">
              {t("notLoggedIn.signupBtn")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const copy = statusCopy(user);
  const StatusIcon = copy.icon;

  return (
    <main className="app-page">
      <section className="app-shell">
        <header className="app-header">
          <Link className="site-brand" href="/">
            <span className="brand-symbol">
              <UserRoundCog size={18} aria-hidden />
            </span>
            <strong>{t("header.brandName")}</strong>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {user.is_platform_admin && (
              <Link className="secondary-link logout-button" href="/admin">
                <ShieldCheck size={16} aria-hidden />
                {t("header.adminPanelBtn")}
              </Link>
            )}
            <button className="secondary-link logout-button" type="button" onClick={logout}>
              <LogOut size={16} aria-hidden />
              {t("header.logOutBtn")}
            </button>
          </div>
        </header>

        <div className="status-panel" aria-live="polite">
          <div className="status-icon" aria-hidden>
            <StatusIcon size={24} />
          </div>
          <div>
            <p className="eyebrow">{copy.role}</p>
            <h1 ref={headingRef} tabIndex={-1}>{copy.title}</h1>
            <p>{copy.body}</p>
          </div>
        </div>

        <VerificationStatusSummary user={user} />

        <div className="workspace-grid">
          <article>
            <span>{t("accountCard.label")}</span>
            <strong>{user.email}</strong>
            <p>{t("accountCard.statusLine", { status: user.account_status })}</p>
          </article>
          <article>
            <span>{t("nextStepCard.label")}</span>
            <strong>{user.is_approved ? t("nextStepCard.openTools") : t("nextStepCard.completeProfile")}</strong>
            <p>
              {user.role === "agency"
                ? t("nextStepCard.agencyBody")
                : t("nextStepCard.defaultBody")}
            </p>
          </article>
        </div>
        <AccountDeletionPanel email={user.email} />
      </section>
    </main>
  );
}

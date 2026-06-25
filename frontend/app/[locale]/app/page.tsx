"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock3, LogOut, ShieldCheck, ShieldAlert, UserRoundCog } from "lucide-react";
import { CurrentUser, apiFetch } from "../../../lib/api";
import AccountDeletionPanel from "../../../components/AccountDeletionPanel";

export default function AppEntryPage() {
  const t = useTranslations("app");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  function statusCopy(u: CurrentUser) {
    const role = t(`roleLabels.${u.role}` as Parameters<typeof t>[0]);
    if (u.account_status === "approved") {
      return { title: t("statusCopy.approved.title", { role }), body: t("statusCopy.approved.body"), icon: CheckCircle2 };
    }
    if (u.account_status === "rejected") {
      return { title: t("statusCopy.rejected.title"), body: t("statusCopy.rejected.body"), icon: ShieldAlert };
    }
    if (u.account_status === "suspended") {
      return { title: t("statusCopy.suspended.title"), body: t("statusCopy.suspended.body"), icon: ShieldAlert };
    }
    return { title: t("statusCopy.pending.title"), body: t("statusCopy.pending.body"), icon: Clock3 };
  }

  useEffect(() => {
    async function loadUser() {
      const response = await apiFetch("/api/accounts/me/");
      if (response.ok) {
        const data = (await response.json()) as CurrentUser;
        if (data.is_platform_admin) {
          window.location.replace("/admin");
          return;
        }
        // Redirect approved hosts straight to their dedicated dashboard
        if (data.role === "host") {
          window.location.replace("/host");
          return;
        }
        if (data.role === "cleaner") {
          window.location.replace("/cleaner");
          return;
        }
        setUser(data);
      }
      setLoading(false);
    }

    void loadUser();
  }, []);

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

        <div className="status-panel">
          <div className="status-icon" aria-hidden>
            <StatusIcon size={24} />
          </div>
          <div>
            <p className="eyebrow">{t(`roleLabels.${user.role}` as Parameters<typeof t>[0])}</p>
            <h1>{copy.title}</h1>
            <p>{copy.body}</p>
          </div>
        </div>

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

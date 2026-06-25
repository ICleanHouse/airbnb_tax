"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";
import { apiFetch, type CurrentUser } from "../../../lib/api";
import CleanerBrowser from "../../../components/CleanerBrowser";
import NotificationBell from "../../../components/NotificationBell";
import Connections from "../../../components/Connections";

export default function CleanersDirectoryPage() {
  const t = useTranslations("cleaners");
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    apiFetch("/api/accounts/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CurrentUser | null) => setMe(d))
      .finally(() => setLoadingMe(false));
  }, []);

  const canView = useMemo(
    () => !!me && (me.role === "host" || me.is_platform_admin),
    [me],
  );

  if (loadingMe) {
    return <main className="host-page"><p className="host-loading">{t("gates.loading")}</p></main>;
  }

  if (!canView) {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.hostsOnly")}</p>
          <h1>{t("gates.hostsOnlyBody")}</h1>
          <Link className="primary-link" href="/login">{t("gates.goToLogin")}</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="host-topbar">
        <Link className="site-brand" href="/host">
          <span className="brand-symbol brand-symbol--icon"><ChevronLeft size={18} aria-hidden={true} /></span>
          <strong>{t("topbar.backLabel")}</strong>
        </Link>
        <div aria-hidden="true" />
        <div className="host-topbar-right">
          <Link className="text-link" href="/host">{t("topbar.dashboardLink")}</Link>
          <NotificationBell />
          {me && <Connections meId={me.id} showTrigger={false} />}
          <span className="user-chip">
            {me?.first_name ? `${me.first_name} ${me.last_name}`.trim() : me?.email}
            <span className="user-chip-dot" aria-hidden={true}>·</span>
            <span>{me?.role}</span>
          </span>
        </div>
      </header>

      <main className="host-page">
        <div className="cleaners-directory">
          <div className="cleaners-directory-head">
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>{t("head.eyebrow")}</p>
            <h1 className="host-section-title">{t("head.title")}</h1>
          </div>
          <CleanerBrowser offerEnabled />
        </div>
      </main>
    </>
  );
}

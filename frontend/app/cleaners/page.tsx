"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { apiFetch, type CurrentUser } from "../../lib/api";
import CleanerBrowser from "../components/CleanerBrowser";
import NotificationBell from "../components/NotificationBell";
import Connections from "../../components/Connections";

export default function CleanersDirectoryPage() {
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
    return <main className="host-page"><p className="host-loading">Loading...</p></main>;
  }

  if (!canView) {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">Hosts only</p>
          <h1>The cleaner directory is available to hosts.</h1>
          <Link className="primary-link" href="/login">Go to login</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="host-topbar">
        <Link className="site-brand" href="/host">
          <span className="brand-symbol"><ChevronLeft size={18} aria-hidden={true} /></span>
          <strong>Find a cleaner</strong>
        </Link>
        <div aria-hidden="true" />
        <div className="host-topbar-right">
          <Link className="text-link" href="/host">Dashboard</Link>
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
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>Verified supply</p>
            <h1 className="host-section-title">Browse cleaners</h1>
          </div>
          <CleanerBrowser offerEnabled />
        </div>
      </main>
    </>
  );
}

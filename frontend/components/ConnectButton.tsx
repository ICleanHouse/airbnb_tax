"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Clock, Check } from "lucide-react";
import { apiFetch, type Connection } from "../lib/api";
import { withLocale, type AppLocale } from "../lib/redirects";

type State = "loading" | "idle" | "pending" | "connected";

/**
 * Reusable "Connect" button for a target user. On mount it checks the current
 * relationship (via the connections list) and renders Connect / Pending /
 * Connected accordingly. Sending a request flips it to Pending.
 */
export default function ConnectButton({
  cleanerPublicId,
  returnTo,
  className = "",
}: {
  cleanerPublicId: string;
  returnTo: string;
  className?: string;
}) {
  const t = useTranslations("components.connectButton");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/connections/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(d)
          ? (d as Connection[])
          : ((d as { results?: Connection[] } | null)?.results ?? []);
        const found = list.find((c) => c.other_user_public_id === cleanerPublicId);
        setState(found ? (found.status === "accepted" ? "connected" : "pending") : "idle");
      })
      .catch(() => {
        if (!cancelled) setState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [cleanerPublicId]);

  async function connect() {
    setState("pending");
    const res = await apiFetch("/api/connections/", {
      method: "POST",
      body: JSON.stringify({ cleaner_public_id: cleanerPublicId }),
    });
    if (res.ok) {
      const c = (await res.json()) as Connection;
      setState(c.status === "accepted" ? "connected" : "pending");
    } else if (res.status === 401 || res.status === 403) {
      const locale = window.location.pathname.split("/")[1] as AppLocale;
      const destination = withLocale(returnTo, locale === "en" ? "en" : "bg");
      window.location.href = `/${locale === "en" ? "en" : "bg"}/login?next=${encodeURIComponent(destination)}`;
    } else {
      setState("idle");
    }
  }

  if (state === "loading") return null;
  if (state === "connected") {
    return (
      <span className={`connect-btn connect-btn--done ${className}`}>
        <Check size={13} aria-hidden /> {t("connected")}
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className={`connect-btn connect-btn--pending ${className}`}>
        <Clock size={13} aria-hidden /> {t("pending")}
      </span>
    );
  }
  return (
    <button type="button" className={`connect-btn ${className}`} onClick={() => void connect()}>
      <UserPlus size={13} aria-hidden /> {t("connect")}
    </button>
  );
}

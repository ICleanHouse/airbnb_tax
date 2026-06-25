"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Clock, Check } from "lucide-react";
import { apiFetch, type Connection } from "../lib/api";

type State = "loading" | "idle" | "pending" | "connected";

/**
 * Reusable "Connect" button for a target user. On mount it checks the current
 * relationship (via the connections list) and renders Connect / Pending /
 * Connected accordingly. Sending a request flips it to Pending.
 */
export default function ConnectButton({
  targetUserId,
  className = "",
}: {
  targetUserId: number;
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
        const found = list.find((c) => c.other_user_id === targetUserId);
        setState(found ? (found.status === "accepted" ? "connected" : "pending") : "idle");
      })
      .catch(() => {
        if (!cancelled) setState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  async function connect() {
    setState("pending");
    const res = await apiFetch("/api/connections/", {
      method: "POST",
      body: JSON.stringify({ user_id: targetUserId }),
    });
    if (res.ok) {
      const c = (await res.json()) as Connection;
      setState(c.status === "accepted" ? "connected" : "pending");
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

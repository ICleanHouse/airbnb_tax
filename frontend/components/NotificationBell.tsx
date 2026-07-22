"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Check } from "lucide-react";
import { apiFetch, type AppNotification } from "../lib/api";
import { connectionTarget, notificationDestination } from "./notificationRouting";

const BASE = "/api/notifications/notifications";
const POLL_MS = 30_000;

/**
 * Shared notification bell for the host and cleaner topbars. Polls the unread
 * count, opens a dropdown of recent notifications, and supports mark-read /
 * mark-all-read against the persisted Notification model.
 */
export default function NotificationBell() {
  const t = useTranslations("components.notificationBell");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t("timeAgo.justNow");
    if (mins < 60) return t("timeAgo.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("timeAgo.hoursAgo", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("timeAgo.daysAgo", { count: days });
  }
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    const res = await apiFetch(`${BASE}/unread-count/`);
    if (res.ok) {
      const data = (await res.json()) as { unread: number };
      setUnread(data.unread ?? 0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`${BASE}/`);
    if (res.ok) {
      const data: unknown = await res.json();
      const list = Array.isArray(data)
        ? (data as AppNotification[])
        : ((data as { results?: AppNotification[] }).results ?? []);
      setItems(list.slice(0, 20));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCount();
    const id = window.setInterval(() => void loadCount(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadCount]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(id: number) {
    await apiFetch(`${BASE}/${id}/mark_read/`, { method: "POST" });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    await apiFetch(`${BASE}/read-all/`, { method: "POST" });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
  }

  async function handleNotificationClick(notification: AppNotification) {
    if (notification.read_at === null) {
      await markRead(notification.id);
    }

    // Connection / message notifications open the Connections drawer (a sibling
    // component) via a window event rather than navigating. A message or an
    // accepted-connection opens the chat thread directly; a request opens the list.
    const connection = connectionTarget(notification);
    if (connection) {
      setOpen(false);
      window.dispatchEvent(
        new CustomEvent("hc:open-connection", {
          detail: { connectionId: connection.openChat ? connection.connectionId : null },
        }),
      );
      return;
    }

    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    setOpen(false);
    router.push(notificationDestination(notification, pathname));
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell-trigger"
        aria-label={unread > 0 ? t("ariaLabelUnread", { count: unread }) : t("ariaLabel")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && <span className="notif-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu">
          <div className="notif-dropdown-head">
            <strong>{t("heading")}</strong>
            {unread > 0 && (
              <button type="button" className="notif-markall" onClick={() => void markAll()}>
                <Check size={13} aria-hidden /> {t("markAllRead")}
              </button>
            )}
          </div>

          <div className="notif-dropdown-body">
            {loading ? (
              <p className="notif-empty">{t("loading")}</p>
            ) : items.length === 0 ? (
              <p className="notif-empty">{t("empty")}</p>
            ) : (
              <ul className="notif-list">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`notif-item${n.read_at ? "" : " notif-item--unread"}`}
                  >
                    <button
                      type="button"
                      className="notif-item-btn"
                      onClick={() => void handleNotificationClick(n)}
                    >
                      <span className="notif-item-title">{n.title}</span>
                      {n.body && <span className="notif-item-body">{n.body}</span>}
                      <span className="notif-item-time">{timeAgo(n.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

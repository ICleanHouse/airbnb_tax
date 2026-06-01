"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { apiFetch, type AppNotification } from "../../lib/api";

const BASE = "/api/notifications/notifications";
const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Shared notification bell for the host and cleaner topbars. Polls the unread
 * count, opens a dropdown of recent notifications, and supports mark-read /
 * mark-all-read against the persisted Notification model.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell-trigger"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && <span className="notif-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu">
          <div className="notif-dropdown-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="notif-markall" onClick={() => void markAll()}>
                <Check size={13} aria-hidden /> Mark all read
              </button>
            )}
          </div>

          <div className="notif-dropdown-body">
            {loading ? (
              <p className="notif-empty">Loading…</p>
            ) : items.length === 0 ? (
              <p className="notif-empty">You&apos;re all caught up.</p>
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
                      onClick={() => n.read_at === null && void markRead(n.id)}
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

"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  X,
  Send,
  Check,
  ChevronLeft,
  Building2,
  CalendarDays,
  Trash2,
} from "lucide-react";
import { apiFetch, type ChatMessage, type Connection, type SharedContext } from "../lib/api";
import { money } from "../lib/money";

const BASE = "/api/connections";
const COUNT_POLL_MS = 30_000;
const CHAT_POLL_MS = 5_000;

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function localDateKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Connections launcher — a nav button (with unread badge) that opens a right-hand
 * drawer listing connection requests + accepted connections, an in-app chat
 * thread (polled), and a "Shared" panel of currently authorized assigned work.
 * Used in both the host and cleaner topbars.
 */
export default function Connections({
  meId,
  showTrigger = true,
}: {
  meId: number | null;
  /** When false the nav button is hidden but the drawer + bell-event listener
   *  still mount — use this on pages that show the bell but have no nav tab. */
  showTrigger?: boolean;
}) {
  const t = useTranslations("components.connections");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Connection[]>([]);

  function fmtDateSeparator(iso: string, now = new Date()): string {
    const date = new Date(iso);
    if (localDateKey(iso) === localDateKey(now.toISOString())) {
      return t("today");
    }
    if (date.getFullYear() !== now.getFullYear()) {
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }
    const dateLabel = date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return `${dateLabel}, ${fmtTime(iso)}`;
  }
  const [loadingList, setLoadingList] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingReq, setPendingReq] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [shared, setShared] = useState<SharedContext | null>(null);
  const [showShared, setShowShared] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const active = items.find((c) => c.id === activeId) ?? null;
  const badge = unread + pendingReq;

  const loadCount = useCallback(async () => {
    const res = await apiFetch(`${BASE}/unread-count/`);
    if (res.ok) {
      const d = (await res.json()) as { unread: number; pending_requests: number };
      setUnread(d.unread ?? 0);
      setPendingReq(d.pending_requests ?? 0);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const res = await apiFetch(`${BASE}/`);
    if (res.ok) {
      const d: unknown = await res.json();
      const list = Array.isArray(d) ? (d as Connection[]) : ((d as { results?: Connection[] }).results ?? []);
      setItems(list);
    }
    setLoadingList(false);
  }, []);

  const loadMessages = useCallback(async (id: number) => {
    const res = await apiFetch(`${BASE}/${id}/messages/`);
    if (res.ok) {
      const d: unknown = await res.json();
      setMessages(Array.isArray(d) ? (d as ChatMessage[]) : ((d as { results?: ChatMessage[] }).results ?? []));
    }
  }, []);

  // Poll the unread/pending badge while mounted.
  useEffect(() => {
    void loadCount();
    const id = window.setInterval(() => void loadCount(), COUNT_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadCount]);

  // Load the list whenever the drawer opens.
  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  // Poll the open chat thread (and refresh the badge — reading marks as read).
  useEffect(() => {
    if (activeId == null || !open) return;
    void loadMessages(activeId);
    void loadCount();
    const id = window.setInterval(() => void loadMessages(activeId), CHAT_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeId, open, loadMessages, loadCount]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, activeId]);

  // Lazily fetch shared context when the panel is opened.
  useEffect(() => {
    if (!showShared || activeId == null) return;
    let cancelled = false;
    void apiFetch(`${BASE}/${activeId}/shared/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SharedContext | null) => {
        if (!cancelled) setShared(d);
      });
    return () => {
      cancelled = true;
    };
  }, [showShared, activeId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Open the drawer (and optionally a specific chat) when the notification bell
  // dispatches a connection/message notification click.
  useEffect(() => {
    function onOpenConnection(e: Event) {
      const detail = (e as CustomEvent<{ connectionId: number | null }>).detail;
      setOpen(true);
      setActiveId(detail?.connectionId ?? null);
      setShowShared(false);
      setShared(null);
      void loadList();
    }
    window.addEventListener("hc:open-connection", onOpenConnection);
    return () => window.removeEventListener("hc:open-connection", onOpenConnection);
  }, [loadList]);

  async function accept(id: number) {
    await apiFetch(`${BASE}/${id}/accept/`, { method: "POST" });
    await loadList();
    await loadCount();
  }
  async function decline(id: number) {
    await apiFetch(`${BASE}/${id}/decline/`, { method: "POST" });
    await loadList();
    await loadCount();
  }
  async function remove(id: number) {
    await apiFetch(`${BASE}/${id}/`, { method: "DELETE" });
    setActiveId(null);
    await loadList();
    await loadCount();
  }

  async function send() {
    const body = draft.trim();
    if (!body || activeId == null) return;
    setSending(true);
    try {
      const res = await apiFetch(`${BASE}/${activeId}/messages/`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const m = (await res.json()) as ChatMessage;
        setMessages((prev) => [...prev, m]);
        setDraft("");
        void loadList();
      }
    } finally {
      setSending(false);
    }
  }

  function openConnection(id: number) {
    setActiveId(id);
    setShowShared(false);
    setShared(null);
  }

  const incoming = items.filter((c) => c.status === "pending" && c.direction === "incoming");
  const outgoing = items.filter((c) => c.status === "pending" && c.direction === "outgoing");
  const connected = items.filter((c) => c.status === "accepted");

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          className="host-tab connections-tab"
          onClick={() => setOpen((v) => !v)}
          aria-label={badge > 0 ? t("tabAriaLabelNew", { count: badge }) : t("tabAriaLabel")}
          aria-expanded={open}
        >
          <Users size={15} aria-hidden />
          {t("tabLabel")}
          {badge > 0 && (
            <span className="host-tab-count host-tab-count--alert">{badge > 9 ? "9+" : badge}</span>
          )}
        </button>
      )}

      {open && (
        <div className="connections-overlay">
          <aside className="connections-drawer" ref={ref} role="dialog" aria-label={t("drawerAriaLabel")}>
            {active ? (
              <div className="connections-chat">
                <div className="connections-chat-head">
                  <button
                    type="button"
                    className="connections-icon-btn"
                    onClick={() => setActiveId(null)}
                    aria-label={t("backAriaLabel")}
                  >
                    <ChevronLeft size={18} aria-hidden />
                  </button>
                  <div className="connection-avatar">
                    {active.other_user_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={active.other_user_image} alt="" />
                    ) : (
                      <span>{initials(active.other_user_name)}</span>
                    )}
                  </div>
                  <div className="connections-chat-who">
                    <strong>{active.other_user_name}</strong>
                    <span>{active.other_user_role}</span>
                  </div>
                  <button
                    type="button"
                    className={`connections-shared-toggle${showShared ? " active" : ""}`}
                    onClick={() => setShowShared((v) => !v)}
                  >
                    {t("sharedBtn")}
                  </button>
                  <button
                    type="button"
                    className="connections-icon-btn"
                    onClick={() => setOpen(false)}
                    aria-label={t("closeAriaLabel")}
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                {showShared ? (
                  <div className="connections-shared">
                    {shared == null ? (
                      <p className="connections-empty">{t("sharedLoading")}</p>
                    ) : shared.cleanings_count === 0 ? (
                      <p className="connections-empty">{t("sharedEmpty")}</p>
                    ) : (
                      <>
                        <h4 className="connections-shared-title">
                          <Building2 size={13} aria-hidden /> {t("sharedProperties")}
                        </h4>
                        <ul className="connections-shared-list">
                          {shared.properties.map((p) => (
                            <li key={`${p.name}:${p.city}`}>
                              <span>{p.name}{p.city ? ` · ${p.city}` : ""}</span>
                              <span className="connections-shared-count">{p.cleanings}</span>
                            </li>
                          ))}
                        </ul>
                        <h4 className="connections-shared-title">
                          <CalendarDays size={13} aria-hidden /> {t("sharedCleanings", { count: shared.cleanings_count })}
                        </h4>
                        <ul className="connections-shared-list">
                          {shared.cleanings.slice(0, 20).map((c) => (
                            <li key={c.job_id}>
                              <span>
                                {c.property_name}
                                <small>{new Date(c.scheduled_start).toLocaleDateString("en-GB")}</small>
                              </span>
                              <span className="connections-shared-count">
                                {money(c.agreed_price, c.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="connections-remove"
                          onClick={() => void remove(active.id)}
                        >
                          <Trash2 size={13} aria-hidden /> {t("removeConnection")}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="connections-thread" ref={threadRef}>
                      {messages.length === 0 ? (
                        <p className="connections-empty">{t("chatEmpty")}</p>
                      ) : (
                        messages.map((m, index) => {
                          const showDateSeparator = index === 0
                            || localDateKey(messages[index - 1].created_at) !== localDateKey(m.created_at);
                          const dateLabel = showDateSeparator ? fmtDateSeparator(m.created_at) : "";
                          return (
                            <Fragment key={m.id}>
                              {showDateSeparator ? (
                                <div className="chat-date-separator" role="separator" aria-label={dateLabel}>
                                  <span>{dateLabel}</span>
                                </div>
                              ) : null}
                              <div className={`chat-bubble${m.sender === meId ? " chat-bubble--me" : ""}`}>
                                <span className="chat-bubble-body">{m.body}</span>
                                <span className="chat-bubble-time">{fmtTime(m.created_at)}</span>
                              </div>
                            </Fragment>
                          );
                        })
                      )}
                    </div>
                    <form
                      className="connections-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("messagePlaceholder", { firstName: active.other_user_name.split(" ")[0] })}
                        aria-label={t("messageAriaLabel")}
                      />
                      <button type="submit" disabled={sending || !draft.trim()} aria-label={t("sendAriaLabel")}>
                        <Send size={16} aria-hidden />
                      </button>
                    </form>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="connections-head">
                  <strong>{t("heading")}</strong>
                  <button
                    type="button"
                    className="connections-icon-btn"
                    onClick={() => setOpen(false)}
                    aria-label={t("closeAriaLabel")}
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                <div className="connections-body">
                  {loadingList ? (
                    <p className="connections-empty">{t("listLoading")}</p>
                  ) : (
                    <>
                      {incoming.length > 0 && (
                        <div className="connections-group">
                          <h4 className="connections-group-title">{t("requestsTitle")}</h4>
                          {incoming.map((c) => (
                            <div key={c.id} className="connection-row">
                              <div className="connection-avatar">
                                {c.other_user_image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.other_user_image} alt="" />
                                ) : (
                                  <span>{initials(c.other_user_name)}</span>
                                )}
                              </div>
                              <div className="connection-row-main">
                                <strong>{c.other_user_name}</strong>
                                <span>{t("wantsToConnect")}</span>
                              </div>
                              <div className="connection-row-actions">
                                <button
                                  type="button"
                                  className="connections-accept"
                                  onClick={() => void accept(c.id)}
                                  aria-label={t("acceptAriaLabel")}
                                >
                                  <Check size={15} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  className="connections-decline"
                                  onClick={() => void decline(c.id)}
                                  aria-label={t("declineAriaLabel")}
                                >
                                  <X size={15} aria-hidden />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="connections-group">
                        <h4 className="connections-group-title">
                          {connected.length > 0 ? t("connectedTitleCount", { count: connected.length }) : t("connectedTitle")}
                        </h4>
                        {connected.length === 0 ? (
                          <p className="connections-empty">
                            {t("emptyConnected")}
                          </p>
                        ) : (
                          connected.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="connection-row connection-row--btn"
                              onClick={() => openConnection(c.id)}
                            >
                              <div className="connection-avatar">
                                {c.other_user_image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.other_user_image} alt="" />
                                ) : (
                                  <span>{initials(c.other_user_name)}</span>
                                )}
                                {c.unread_count > 0 && <span className="connection-unread-dot" />}
                              </div>
                              <div className="connection-row-main">
                                <strong>{c.other_user_name}</strong>
                                <span>
                                  {c.last_message ? c.last_message.body : c.other_user_role}
                                </span>
                              </div>
                              {c.unread_count > 0 && (
                                <span className="connection-unread">{c.unread_count}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>

                      {outgoing.length > 0 && (
                        <div className="connections-group">
                          <h4 className="connections-group-title">{t("pendingTitle")}</h4>
                          {outgoing.map((c) => (
                            <div key={c.id} className="connection-row">
                              <div className="connection-avatar">
                                {c.other_user_image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.other_user_image} alt="" />
                                ) : (
                                  <span>{initials(c.other_user_name)}</span>
                                )}
                              </div>
                              <div className="connection-row-main">
                                <strong>{c.other_user_name}</strong>
                                <span>{t("requestSent")}</span>
                              </div>
                              <button
                                type="button"
                                className="connections-cancel"
                                onClick={() => void remove(c.id)}
                              >
                                {t("cancelBtn")}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

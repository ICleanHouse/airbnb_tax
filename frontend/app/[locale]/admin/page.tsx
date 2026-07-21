"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Home as HomeIcon,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Users,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch, CurrentUser, roleLabel, UserRole } from "../../../lib/api";
import { useLiveRefresh } from "../../../lib/useLiveRefresh";

interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  preferred_language: string;
  role: UserRole;
  account_status: string;
  is_approved: boolean;
  is_platform_admin: boolean;
  approved_at: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  contact_verified: boolean;
  fully_verified: boolean;
  marketplace_eligible: boolean;
  cleaner_marketplace_status: string | null;
  evidence_excluded: boolean;
  latest_decision: {
    action: string;
    actor: string;
    timestamp: string;
    reason_category: string;
  } | null;
}

interface ReviewEntry {
  action: string;
  actor: string;
  timestamp: string;
  outcome: string;
  reason_category: string;
  internal_note: string;
  previous_status: string;
  next_status: string;
}

type TransitionKind = "reject" | "suspend";

type Filter = "pending" | "approved" | "all";

function AdminPageContent() {
  const t = useTranslations("admin");
  const tNav = useTranslations("nav");
  const STATUS_FILTER_LABELS: Record<Filter, string> = {
    pending: t("sidebar.filterLabels.pending"),
    approved: t("sidebar.filterLabels.approved"),
    all: t("sidebar.filterLabels.all"),
  };
  const searchParams = useSearchParams();
  const initialFilter = (["pending", "approved", "all"].includes(searchParams.get("filter") ?? "")
    ? searchParams.get("filter")
    : "pending") as Filter;

  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [actioning, setActioning] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [transition, setTransition] = useState<{
    kind: TransitionKind;
    user: AdminUser;
  } | null>(null);
  const [reasonCategory, setReasonCategory] = useState("operator_support");
  const [internalNote, setInternalNote] = useState("");
  const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
  const [history, setHistory] = useState<ReviewEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingUsers(true);
      setFetchError("");
    }
    try {
      const res = await apiFetch("/api/accounts/users/");
      if (!res.ok) {
        if (!silent) setFetchError(t("errors.loadFailed"));
        return;
      }
      const data: unknown = await res.json();
      // Handle both plain arrays and DRF-paginated responses
      setAllUsers(
        Array.isArray(data)
          ? (data as AdminUser[])
          : ((data as { results: AdminUser[] }).results ?? []),
      );
    } catch {
      if (!silent) setFetchError(t("errors.networkError"));
    } finally {
      if (!silent) setLoadingUsers(false);
    }
  }, [t]);

  useLiveRefresh(
    () => {
      if (!me?.is_platform_admin) return;
      void loadUsers(true);
    },
    { enabled: me?.is_platform_admin },
  );

  function replaceUser(updated: AdminUser) {
    setAllUsers((previous) =>
      previous.map((user) => (user.id === updated.id ? updated : user)),
    );
  }

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/accounts/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CurrentUser | null) => setMe(data))
      .finally(() => setLoadingMe(false));
  }, []);

  // ── Load users once we know we're an admin ──────────────────────────────────
  useEffect(() => {
    if (me?.is_platform_admin) void loadUsers();
  }, [loadUsers, me]);

  async function reconcile(id: number) {
    setActioning(id);
    setActionError("");
    try {
      const res = await apiFetch(`/api/accounts/users/${id}/reconcile-verification/`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError(t("errors.reconcileFailed"));
        return;
      }
      const data = (await res.json()) as { user: AdminUser; changed: boolean };
      replaceUser(data.user);
    } finally {
      setActioning(null);
    }
  }

  async function submitTransition() {
    if (!transition) return;
    const { kind, user } = transition;
    setActioning(user.id);
    setActionError("");
    try {
      const res = await apiFetch(`/api/accounts/users/${user.id}/${kind}/`, {
        method: "POST",
        body: JSON.stringify({
          expected_status: user.account_status,
          reason_category: reasonCategory,
          internal_note: internalNote,
        }),
      });
      if (!res.ok) {
        setActionError(t(`errors.${kind}Failed`));
        return;
      }
      const data = (await res.json()) as { user: AdminUser; changed: boolean };
      replaceUser(data.user);
      setTransition(null);
      setInternalNote("");
    } finally {
      setActioning(null);
    }
  }

  function openTransition(kind: TransitionKind, user: AdminUser) {
    setReasonCategory(kind === "suspend" ? "marketplace_safety" : "policy_prerequisite_incomplete");
    setInternalNote("");
    setTransition({ kind, user });
  }

  async function openHistory(user: AdminUser) {
    setHistoryUser(user);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await apiFetch(`/api/accounts/users/${user.id}/review-history/`);
      if (response.ok) setHistory((await response.json()) as ReviewEntry[]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function logout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    window.location.href = "/";
  }

  // ── Loading / gate states ────────────────────────────────────────────────────
  if (loadingMe) {
    return (
      <main className="admin-page">
        <p className="admin-loading">{t("gates.loading")}</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.notLoggedIn.eyebrow")}</p>
          <h1>{t("gates.notLoggedIn.heading")}</h1>
          <Link className="primary-link" href="/login">
            {t("gates.notLoggedIn.link")}
          </Link>
        </section>
      </main>
    );
  }

  if (!me.is_platform_admin) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <p className="eyebrow">{t("gates.wrongRole.eyebrow")}</p>
          <h1>{t("gates.wrongRole.heading")}</h1>
          <p>{t("gates.wrongRole.body")}</p>
          <Link className="secondary-link" href="/app">
            {t("gates.wrongRole.link")}
          </Link>
        </section>
      </main>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const pendingCount = allUsers.filter((u) => u.account_status === "pending").length;

  const visibleUsers =
    filter === "all"
      ? allUsers
      : allUsers.filter((u) => u.account_status === filter);

  // ── Admin UI ─────────────────────────────────────────────────────────────────
  return (
    <main className="admin-page">
      {/* ── Top bar ── */}
      <header className="admin-topbar">
        <Link className="site-brand" href="/">
          <span className="brand-symbol">
            <HomeIcon size={18} aria-hidden />
          </span>
          <strong>{tNav("brandName")}</strong>
        </Link>

        <span className="admin-topbar-label">{t("topbar.panelLabel")}</span>

        <div className="admin-topbar-right">
          <span className="user-chip">
            {me.first_name || me.email.split("@")[0]}
            <span className="user-chip-dot" aria-hidden>
              ·
            </span>
            {t("topbar.role")}
          </span>
          <button className="text-link logout-trigger" type="button" onClick={logout}>
            <LogOut size={15} aria-hidden />
            {t("topbar.logOut")}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="admin-body">
        {/* ── Sidebar ── */}
        <aside className="admin-sidebar">
          <p className="admin-sidebar-label">{t("sidebar.accountsLabel")}</p>
          <nav className="admin-nav">
            {(["pending", "approved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`admin-nav-item${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "pending" && <ShieldCheck size={15} aria-hidden />}
                {f === "approved" && <CheckCircle2 size={15} aria-hidden />}
                {f === "all" && <Users size={15} aria-hidden />}
                {STATUS_FILTER_LABELS[f]}
                {f === "pending" && pendingCount > 0 && (
                  <span className="admin-badge">{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <section className="admin-main">
          {/* Section header */}
          <div className="admin-section-header">
            <div>
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>
                {t("section.accountCount", { count: visibleUsers.length })}
              </p>
              <h1 className="admin-section-title">{STATUS_FILTER_LABELS[filter]}</h1>
            </div>
            <button
              className="secondary-link admin-refresh-button"
              type="button"
              onClick={() => void loadUsers()}
              disabled={loadingUsers}
              aria-label={t("section.refreshAriaLabel")}
            >
              <RefreshCcw size={15} aria-hidden />
              {loadingUsers ? t("section.loading") : t("section.refresh")}
            </button>
          </div>

          {/* Errors */}
          {fetchError && <p className="form-error">{fetchError}</p>}
          {actionError && <p className="form-error">{actionError}</p>}

          {/* User list */}
          {loadingUsers ? (
            <p className="admin-empty">{t("section.loadingAccounts")}</p>
          ) : visibleUsers.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={36} />
              <p>
                {filter === "pending"
                  ? t("section.emptyPending")
                  : t("section.emptyOther")}
              </p>
            </div>
          ) : (
            <ul className="admin-user-list">
              {visibleUsers.map((user) => {
                const displayName =
                  `${user.first_name} ${user.last_name}`.trim() ||
                  user.email.split("@")[0];
                const initials = displayName[0]?.toUpperCase() ?? "?";
                const busy = actioning === user.id;
                const accountStatusLabel =
                  user.account_status === "approved"
                    ? t("userRow.approved")
                    : user.account_status === "rejected"
                      ? t("userRow.rejected")
                      : user.account_status === "suspended"
                        ? t("userRow.suspended")
                        : t("userRow.pending");

                return (
                  <li key={user.id} className="admin-user-row">
                    {/* Avatar */}
                    <div className="admin-user-avatar" aria-hidden>
                      {initials}
                    </div>

                    {/* Name / email / phone */}
                    <div className="admin-user-info">
                      <strong>{displayName}</strong>
                      <span>{user.email}</span>
                      {user.phone_number && (
                        <span className="admin-user-phone">{user.phone_number}</span>
                      )}
                    </div>

                    {/* Role + status chips */}
                    <div className="admin-user-meta">
                      <div className="admin-user-chips">
                        <span className="admin-role-chip">
                          {user.is_platform_admin ? t("userRow.adminChip") : roleLabel(user.role)}
                        </span>
                        <span
                          className={`admin-status-chip admin-status-${user.account_status}`}
                        >
                          {accountStatusLabel}
                        </span>
                        {user.evidence_excluded && (
                          <span className="admin-evidence-chip">{t("userRow.evidenceExcluded")}</span>
                        )}
                      </div>
                      <dl className="admin-verification-grid">
                        <div><dt>{t("userRow.account")}</dt><dd>{accountStatusLabel}</dd></div>
                        <div><dt>{t("userRow.email")}</dt><dd>{user.email_verified ? t("userRow.confirmed") : t("userRow.incomplete")}</dd></div>
                        <div><dt>{t("userRow.phone")}</dt><dd>{user.phone_verified ? t("userRow.confirmed") : t("userRow.incomplete")}</dd></div>
                        <div><dt>{t("userRow.contact")}</dt><dd>{user.contact_verified ? t("userRow.confirmed") : t("userRow.incomplete")}</dd></div>
                        <div><dt>{t("userRow.marketplace")}</dt><dd>{user.marketplace_eligible ? t("userRow.active") : t("userRow.locked")}</dd></div>
                        <div><dt>{t("userRow.full")}</dt><dd>{user.fully_verified ? t("userRow.confirmed") : t("userRow.incomplete")}</dd></div>
                        {user.cleaner_marketplace_status && (
                          <div>
                            <dt>{t("userRow.cleanerStatus")}</dt>
                            <dd>
                              {user.cleaner_marketplace_status === "verified"
                                ? t("userRow.cleanerStatusActive")
                                : user.cleaner_marketplace_status === "pending"
                                  ? t("userRow.cleanerStatusPending")
                                  : t("userRow.cleanerStatusUnavailable")}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {user.latest_decision && (
                        <p className="admin-latest-decision">
                          {t("userRow.latestDecision", {
                            action: user.latest_decision.action,
                            actor: user.latest_decision.actor,
                            timestamp: new Date(user.latest_decision.timestamp).toLocaleString(),
                          })}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="admin-user-actions">
                      {user.account_status === "pending" && (
                        <>
                          <button
                            className="admin-action-approve"
                            type="button"
                            disabled={busy}
                            onClick={() => void reconcile(user.id)}
                          >
                            <CheckCircle2 size={14} aria-hidden />
                            {busy ? t("userRow.busy") : t("userRow.reconcile")}
                          </button>
                          <button
                            className="admin-action-reject"
                            type="button"
                            disabled={busy}
                            onClick={() => openTransition("reject", user)}
                          >
                            <XCircle size={14} aria-hidden />
                            {busy ? t("userRow.busy") : t("userRow.reject")}
                          </button>
                        </>
                      )}
                      {user.account_status === "approved" && (
                        <button
                          className="admin-action-reject"
                          type="button"
                          disabled={busy}
                          onClick={() => openTransition("suspend", user)}
                        >
                          <ShieldX size={14} aria-hidden />
                          {busy ? t("userRow.busy") : t("userRow.suspend")}
                        </button>
                      )}
                      {user.account_status === "rejected" && (
                        <span className="admin-action-label admin-action-label--rejected">
                          <ShieldX size={14} aria-hidden />
                          {t("userRow.rejected")}
                        </span>
                      )}
                      {user.account_status === "suspended" && (
                        <span className="admin-action-label admin-action-label--rejected">
                          <ShieldX size={14} aria-hidden />
                          {t("userRow.suspended")}
                        </span>
                      )}
                      <button
                        className="text-link admin-history-button"
                        type="button"
                        onClick={() => void openHistory(user)}
                      >
                        {t("userRow.history")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {transition && (
        <div className="host-modal-backdrop" role="presentation">
          <section
            className="host-modal admin-decision-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-decision-title"
          >
            <h2 id="admin-decision-title">
              {transition.kind === "reject"
                ? t("decisionDialog.rejectTitle")
                : t("decisionDialog.suspendTitle")}
            </h2>
            <p>{t("decisionDialog.body", { email: transition.user.email })}</p>
            <label>
              {t("decisionDialog.reasonLabel")}
              <select
                value={reasonCategory}
                onChange={(event) => setReasonCategory(event.target.value)}
              >
                {transition.kind === "reject" && (
                  <option value="policy_prerequisite_incomplete">
                    {t("decisionDialog.reasons.prerequisite")}
                  </option>
                )}
                <option value="marketplace_safety">
                  {t("decisionDialog.reasons.safety")}
                </option>
                <option value="terms_or_policy_breach">
                  {t("decisionDialog.reasons.policy")}
                </option>
                <option value="operator_support">
                  {t("decisionDialog.reasons.support")}
                </option>
              </select>
            </label>
            <label>
              {t("decisionDialog.noteLabel")}
              <textarea
                value={internalNote}
                maxLength={2000}
                onChange={(event) => setInternalNote(event.target.value)}
              />
            </label>
            <p className="admin-private-note">{t("decisionDialog.notePrivacy")}</p>
            <div className="host-modal-actions">
              <button
                className="secondary-link"
                type="button"
                autoFocus
                onClick={() => setTransition(null)}
              >
                {t("decisionDialog.cancel")}
              </button>
              <button
                className="admin-action-reject"
                type="button"
                disabled={actioning === transition.user.id}
                onClick={() => void submitTransition()}
              >
                {transition.kind === "reject"
                  ? t("decisionDialog.confirmReject")
                  : t("decisionDialog.confirmSuspend")}
              </button>
            </div>
          </section>
        </div>
      )}

      {historyUser && (
        <div className="host-modal-backdrop" role="presentation">
          <section
            className="host-modal admin-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-history-title"
          >
            <h2 id="admin-history-title">{t("historyDialog.title")}</h2>
            <p>{historyUser.email}</p>
            {historyLoading ? (
              <p>{t("historyDialog.loading")}</p>
            ) : history.length === 0 ? (
              <p>{t("historyDialog.empty")}</p>
            ) : (
              <ol className="admin-history-list">
                {history.map((entry, index) => (
                  <li key={`${entry.action}-${entry.timestamp}-${index}`}>
                    <strong>{entry.action}</strong>
                    <span>{entry.previous_status} → {entry.next_status}</span>
                    <span>{entry.actor} · {entry.reason_category} · {entry.outcome}</span>
                    <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
                    {entry.internal_note && <p>{entry.internal_note}</p>}
                  </li>
                ))}
              </ol>
            )}
            <button
              className="secondary-link"
              type="button"
              autoFocus
              onClick={() => setHistoryUser(null)}
            >
              {t("historyDialog.close")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function AdminPageFallback() {
  const t = useTranslations("admin");
  return <main className="admin-page">{t("section.suspenseFallback")}</main>;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <AdminPageContent />
    </Suspense>
  );
}

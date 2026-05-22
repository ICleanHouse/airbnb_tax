"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { apiFetch, CurrentUser, roleLabel, UserRole } from "../../lib/api";

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
}

type Filter = "pending" | "approved" | "all";

const STATUS_FILTER_LABELS: Record<Filter, string> = {
  pending: "Pending approval",
  approved: "Approved",
  all: "All accounts",
};

export default function AdminPage() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function loadUsers() {
    setLoadingUsers(true);
    setFetchError("");
    try {
      const res = await apiFetch("/api/accounts/users/");
      if (!res.ok) {
        setFetchError("Failed to load accounts.");
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
      setFetchError("Network error — check the backend is running.");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function approve(id: number) {
    setActioning(id);
    setActionError("");
    try {
      const res = await apiFetch(`/api/accounts/users/${id}/approve/`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError("Approval failed — please try again.");
        return;
      }
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, account_status: "approved", is_approved: true } : u,
        ),
      );
    } finally {
      setActioning(null);
    }
  }

  async function reject(id: number) {
    setActioning(id);
    setActionError("");
    try {
      const res = await apiFetch(`/api/accounts/users/${id}/reject/`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError("Rejection failed — please try again.");
        return;
      }
      setAllUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, account_status: "rejected", is_approved: false } : u)),
      );
    } finally {
      setActioning(null);
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
        <p className="admin-loading">Checking session…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <p className="eyebrow">Protected area</p>
          <h1>Log in to continue</h1>
          <Link className="primary-link" href="/login">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  if (!me.is_platform_admin) {
    return (
      <main className="admin-page">
        <section className="admin-gate">
          <p className="eyebrow">Admin only</p>
          <h1>Access restricted</h1>
          <p>This panel is reserved for marketplace administrators.</p>
          <Link className="secondary-link" href="/app">
            Go to your dashboard
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
          <strong>Host Cleaners</strong>
        </Link>

        <span className="admin-topbar-label">Admin panel</span>

        <div className="admin-topbar-right">
          <span className="user-chip">
            {me.first_name || me.email.split("@")[0]}
            <span className="user-chip-dot" aria-hidden>
              ·
            </span>
            Admin
          </span>
          <button className="text-link logout-trigger" type="button" onClick={logout}>
            <LogOut size={15} aria-hidden />
            Log out
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="admin-body">
        {/* ── Sidebar ── */}
        <aside className="admin-sidebar">
          <p className="admin-sidebar-label">Accounts</p>
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
                {visibleUsers.length} account{visibleUsers.length !== 1 ? "s" : ""}
              </p>
              <h1 className="admin-section-title">{STATUS_FILTER_LABELS[filter]}</h1>
            </div>
            <button
              className="secondary-link admin-refresh-button"
              type="button"
              onClick={() => void loadUsers()}
              disabled={loadingUsers}
              aria-label="Refresh list"
            >
              <RefreshCcw size={15} aria-hidden />
              {loadingUsers ? "Loading…" : "Refresh"}
            </button>
          </div>

          {/* Errors */}
          {fetchError && <p className="form-error">{fetchError}</p>}
          {actionError && <p className="form-error">{actionError}</p>}

          {/* User list */}
          {loadingUsers ? (
            <p className="admin-empty">Loading accounts…</p>
          ) : visibleUsers.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={36} />
              <p>
                {filter === "pending"
                  ? "No accounts waiting for review."
                  : "No accounts found."}
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
                      <span className="admin-role-chip">
                        {user.is_platform_admin ? "Admin" : roleLabel(user.role)}
                      </span>
                      <span
                        className={`admin-status-chip admin-status-${user.account_status}`}
                      >
                        {user.account_status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="admin-user-actions">
                      {user.account_status === "pending" && (
                        <>
                          <button
                            className="admin-action-approve"
                            type="button"
                            disabled={busy}
                            onClick={() => void approve(user.id)}
                          >
                            <CheckCircle2 size={14} aria-hidden />
                            {busy ? "…" : "Approve"}
                          </button>
                          <button
                            className="admin-action-reject"
                            type="button"
                            disabled={busy}
                            onClick={() => void reject(user.id)}
                          >
                            <XCircle size={14} aria-hidden />
                            {busy ? "…" : "Reject"}
                          </button>
                        </>
                      )}
                      {user.account_status === "approved" && (
                        <span className="admin-action-label admin-action-label--approved">
                          <CheckCircle2 size={14} aria-hidden />
                          Approved
                        </span>
                      )}
                      {user.account_status === "rejected" && (
                        <span className="admin-action-label admin-action-label--rejected">
                          <ShieldX size={14} aria-hidden />
                          Rejected
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

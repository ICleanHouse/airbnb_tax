"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, LogOut, ShieldCheck, ShieldAlert, UserRoundCog } from "lucide-react";
import { CurrentUser, apiFetch, roleLabel } from "../../lib/api";
import AccountDeletionPanel from "../../components/AccountDeletionPanel";

function statusCopy(user: CurrentUser) {
  if (user.account_status === "approved") {
    return {
      title: `${roleLabel(user.role)} workspace`,
      body: "Your account is approved. Marketplace tools can now be opened for your role.",
      icon: CheckCircle2,
    };
  }
  if (user.account_status === "rejected") {
    return {
      title: "Account request rejected",
      body: "Your signup request was not approved. Contact support if this looks incorrect.",
      icon: ShieldAlert,
    };
  }
  if (user.account_status === "suspended") {
    return {
      title: "Account suspended",
      body: "Marketplace access is paused while an admin reviews the account.",
      icon: ShieldAlert,
    };
  }
  return {
    title: "Waiting for admin approval",
    body: "You can complete onboarding details while the marketplace team reviews your account.",
    icon: Clock3,
  };
}

export default function AppEntryPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

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
          <p className="eyebrow">Loading</p>
          <h1>Checking account</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-page">
        <section className="app-shell">
          <p className="eyebrow">Protected area</p>
          <h1>Log in to continue</h1>
          <div className="join-actions">
            <Link className="primary-link" href="/login">
              Log in
            </Link>
            <Link className="secondary-link" href="/signup">
              Sign up
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
            <strong>Host Cleaners</strong>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {user.is_platform_admin && (
              <Link className="secondary-link logout-button" href="/admin">
                <ShieldCheck size={16} aria-hidden />
                Admin panel
              </Link>
            )}
            <button className="secondary-link logout-button" type="button" onClick={logout}>
              <LogOut size={16} aria-hidden />
              Log out
            </button>
          </div>
        </header>

        <div className="status-panel">
          <div className="status-icon" aria-hidden>
            <StatusIcon size={24} />
          </div>
          <div>
            <p className="eyebrow">{roleLabel(user.role)}</p>
            <h1>{copy.title}</h1>
            <p>{copy.body}</p>
          </div>
        </div>

        <div className="workspace-grid">
          <article>
            <span>Account</span>
            <strong>{user.email}</strong>
            <p>Status: {user.account_status}</p>
          </article>
          <article>
            <span>Next step</span>
            <strong>{user.is_approved ? "Open role tools" : "Complete profile details"}</strong>
            <p>
              {user.role === "agency"
                ? "Agency profiles can invite cleaners and assign accepted agency work after approval."
                : "Profile details stay available while marketplace permissions are gated."}
            </p>
          </article>
        </div>
        <AccountDeletionPanel email={user.email} />
      </section>
    </main>
  );
}

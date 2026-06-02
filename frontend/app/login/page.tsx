"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { apiFetch, type CurrentUser } from "../../lib/api";

/** Route a freshly logged-in user to their role's dashboard. */
function dashboardPath(user: CurrentUser | null): string {
  if (!user) return "/";
  if (user.is_platform_admin) return "/admin";
  if (user.role === "host") return "/host";
  if (user.role === "cleaner") return "/cleaner";
  if (user.role === "agency") return "/agency";
  return "/app";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed the csrftoken cookie as soon as the page loads.
  // Django's CsrfViewMiddleware rejects POST requests that arrive without the
  // cookie (fresh incognito windows, different browsers, cleared cookies).
  // This one silent GET guarantees the cookie exists before the form is submitted.
  useEffect(() => {
    void apiFetch("/api/accounts/csrf/");
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await apiFetch("/api/accounts/login/", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError("Check your email and password and try again.");
        return;
      }
      // Forward to the dashboard that matches the user's role.
      const meRes = await apiFetch("/api/accounts/me/");
      const me: CurrentUser | null = meRes.ok ? await meRes.json() : null;
      window.location.href = dashboardPath(me);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <LogIn size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>
        <div className="auth-heading">
          <h1>Log in</h1>
          <p>Use the email and password from your signup request.</p>
        </div>

        <form className="auth-form" onSubmit={submitLogin}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="login-choice-actions">
            <button className="primary-link auth-choice-button" type="submit" disabled={submitting}>
              <LogIn size={18} aria-hidden />
              {submitting ? "Signing in" : "Sign in"}
            </button>
            <div className="auth-divider">
              <span>OR</span>
            </div>
            <Link className="auth-choice-button login-submit" href="/signup">
              <UserPlus size={18} aria-hidden />
              Create an account
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

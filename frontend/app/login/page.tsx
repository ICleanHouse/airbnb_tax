"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { apiFetch } from "../../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      window.location.href = "/app";
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

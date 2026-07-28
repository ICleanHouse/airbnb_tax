"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch, type CurrentUser } from "../../../lib/api";
import { postAuthDestination, safeInternalDestination, type AppLocale } from "../../../lib/redirects";

export default function LoginPage() {
  const t = useTranslations("login");
  const tNav = useTranslations("nav");
  const locale = useLocale() as AppLocale;
  const searchParams = useSearchParams();
  const requestedDestination = safeInternalDestination(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        setError(t("errorCredentials"));
        return;
      }
      const meRes = await apiFetch("/api/accounts/me/");
      const me: CurrentUser | null = meRes.ok ? await meRes.json() : null;
      window.location.href = postAuthDestination(me, requestedDestination, locale);
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
          <strong>{tNav("brandName")}</strong>
        </Link>
        <div className="auth-heading">
          <h1>{t("heading")}</h1>
          <p>{t("subtitle")}</p>
        </div>

        <form className="auth-form" onSubmit={submitLogin}>
          <label>
            <span>{t("emailLabel")}</span>
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>{t("passwordLabel")}</span>
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
              {submitting ? t("signingIn") : t("signIn")}
            </button>
            <div className="auth-divider">
              <span>{t("or")}</span>
            </div>
            <Link className="auth-choice-button login-submit" href={requestedDestination ? `/signup?next=${encodeURIComponent(requestedDestination)}` : "/signup"}>
              <UserPlus size={18} aria-hidden />
              {t("createAccount")}
            </Link>
            <Link className="secondary-link" href="/forgot-password">{t("forgotPassword")}</Link>
          </div>
        </form>
      </section>
    </main>
  );
}

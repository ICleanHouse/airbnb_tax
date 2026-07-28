"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { apiFetch } from "../../../lib/api";

export default function ForgotPasswordPage() {
  const t = useTranslations("passwordRecovery");
  const locale = useLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    try {
      const response = await apiFetch("/api/accounts/password-reset/request/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setState(response.ok ? "success" : "error");
    } catch {
      setState("error");
    }
    headingRef.current?.focus();
  }

  return <main className="auth-page"><section className="auth-panel">
    <div className="auth-heading"><h1 ref={headingRef} tabIndex={-1}>{t("request.heading")}</h1><p>{t("request.copy")}</p></div>
    {state === "success" ? <div role="status" aria-live="polite"><p>{t("request.success")}</p><Link className="primary-link" href={`/${locale}/login`}>{t("backToLogin")}</Link></div> : <form className="auth-form" onSubmit={submit}>
      <label><span>{t("emailLabel")}</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {state === "error" ? <p className="form-error" role="alert">{t("request.error")}</p> : null}
      <button className="primary-link auth-choice-button" type="submit" disabled={state === "submitting"}>{state === "submitting" ? t("request.submitting") : t("request.submit")}</button>
      <Link className="secondary-link" href={`/${locale}/login`}>{t("backToLogin")}</Link>
    </form>}
    <p className="auth-help-copy">{t("support", { channel: "support" })}</p>
  </section></main>;
}

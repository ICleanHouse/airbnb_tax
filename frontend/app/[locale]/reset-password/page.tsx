"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { apiFetch } from "../../../lib/api";

export default function ResetPasswordPage() {
  const t = useTranslations("passwordRecovery");
  const locale = useLocale();
  const params = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const validLink = Boolean(uid && token && uid.length <= 256 && token.length <= 256);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "invalid" | "error">(validLink ? "idle" : "invalid");

  useEffect(() => { if (!validLink) headingRef.current?.focus(); }, [validLink]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setState("error"); headingRef.current?.focus(); return; }
    setState("submitting");
    try {
      const response = await apiFetch("/api/accounts/password-reset/confirm/", { method: "POST", body: JSON.stringify({ uid, token, password, password_confirm: confirm }) });
      if (response.ok) {
        setState("success");
        window.history.replaceState(null, "", `/${locale}/reset-password`);
      } else if (response.status === 400) setState("invalid");
      else setState("error");
    } catch { setState("error"); }
    headingRef.current?.focus();
  }

  const terminal = state === "success" || state === "invalid";
  return <main className="auth-page"><section className="auth-panel">
    <div className="auth-heading"><h1 ref={headingRef} tabIndex={-1}>{state === "success" ? t("confirm.successHeading") : state === "invalid" ? t("confirm.invalidHeading") : t("confirm.heading")}</h1><p>{terminal ? (state === "success" ? t("confirm.successCopy") : t("confirm.invalidCopy")) : t("confirm.copy")}</p></div>
    {terminal ? <Link className="primary-link" href={`/${locale}/login`}>{t("backToLogin")}</Link> : <form className="auth-form" onSubmit={submit}>
      <label><span>{t("newPasswordLabel")}</span><input autoComplete="new-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label><span>{t("confirmPasswordLabel")}</span><input autoComplete="new-password" required type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      {state === "error" ? <p className="form-error" role="alert">{password !== confirm ? t("confirm.mismatch") : t("confirm.error")}</p> : null}
      <button className="primary-link auth-choice-button" type="submit" disabled={state === "submitting"}>{state === "submitting" ? t("confirm.submitting") : t("confirm.submit")}</button>
    </form>}
  </section></main>;
}

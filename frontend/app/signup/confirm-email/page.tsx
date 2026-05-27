"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { MailCheck, RotateCw, UserPlus } from "lucide-react";
import { apiFetch } from "../../../lib/api";

type SignupDraft = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirm: string;
};

function readDraft(): SignupDraft | null {
  const rawDraft = sessionStorage.getItem("signup_draft");
  if (!rawDraft) return null;
  try {
    const parsed = JSON.parse(rawDraft) as Partial<SignupDraft>;
    if (!parsed.email || !parsed.first_name || !parsed.last_name) return null;
    return {
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      email: parsed.email,
      password: parsed.password ?? "",
      password_confirm: parsed.password_confirm ?? "",
    };
  } catch {
    return null;
  }
}

export default function SignupConfirmEmailPage() {
  const [draft, setDraft] = useState<SignupDraft | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const nextDraft = readDraft();
    if (!nextDraft) {
      window.location.href = "/signup";
      return;
    }
    setDraft(nextDraft);
  }, []);

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || submitting) return;

    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/accounts/signup/verify-email-code/", {
        method: "POST",
        body: JSON.stringify({ email: draft.email, code: normalizedCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const codeError = Array.isArray(data.code) ? data.code[0] : data.code;
        setError(typeof codeError === "string" ? codeError : "The confirmation code is incorrect.");
        setSubmitting(false);
        return;
      }
      if (typeof data.email_verification_token !== "string") {
        setError("Could not verify this email. Request a new code and try again.");
        setSubmitting(false);
        return;
      }
      sessionStorage.setItem("signup_email_verification_token", data.email_verification_token);
      window.location.href = "/signup/role";
    } catch {
      setError("Could not verify the code. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (!draft || resending) return;
    setResending(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/accounts/signup/email-code/", {
        method: "POST",
        body: JSON.stringify({
          first_name: draft.first_name,
          last_name: draft.last_name,
          email: draft.email,
        }),
      });
      if (!response.ok) {
        setError("Could not send a new code. Try again.");
        setResending(false);
        return;
      }
      setNotice("A new confirmation code was sent.");
      setResending(false);
    } catch {
      setError("Could not send a new code. Check your connection and try again.");
      setResending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-confirm-step">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>

        <div className="signup-progress-wrap" aria-label="Signup progress">
          <div className="signup-progress-meta">
            <strong>Step 2 of 4</strong>
            <span>50% complete</span>
          </div>
          <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={50}>
            <div className="signup-progress-fill" />
          </div>
        </div>

        <div className="auth-heading">
          <h1>Confirm your email</h1>
          <p>Enter the 6-digit code sent to <strong>{draft?.email ?? "your email"}</strong>.</p>
        </div>

        <form className="auth-form signup-code-form" onSubmit={verifyCode} noValidate>
          <label className="signup-code-label">
            <span>Confirmation code</span>
            <div className={error ? "signup-code-boxes input-invalid" : "signup-code-boxes"} onClick={() => document.getElementById("signup-code-input")?.focus()}>
              {Array.from({ length: 6 }, (_, index) => (
                <span className={code[index] ? "signup-code-box filled" : "signup-code-box"} key={index}>
                  {code[index] ?? ""}
                </span>
              ))}
              <input
                id="signup-code-input"
                className="signup-code-input"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                autoComplete="one-time-code"
                aria-label="Confirmation code"
                aria-invalid={Boolean(error)}
              />
            </div>
            {error ? <small className="field-error-text">{error}</small> : null}
            {notice ? <small className="signup-code-notice">{notice}</small> : null}
          </label>

          <div className="signup-code-actions">
            <button className="primary-link auth-submit" type="submit" disabled={submitting || code.length !== 6}>
              <MailCheck size={18} aria-hidden />
              {submitting ? "Checking code" : "Confirm email"}
            </button>
            <button className="secondary-link signup-resend-button" type="button" onClick={resendCode} disabled={resending}>
              <RotateCw size={17} aria-hidden />
              {resending ? "Sending" : "Resend code"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

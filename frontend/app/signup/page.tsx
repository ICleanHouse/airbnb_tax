"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Apple, UserRoundCheck, UserPlus } from "lucide-react";
import { apiFetch } from "../../lib/api";

type SignupField = "first_name" | "last_name" | "email" | "password" | "password_confirm" | "form";
type SignupFieldErrors = Partial<Record<SignupField, string>>;

function validateEmailAddress(rawEmail: string): string | null {
  const email = rawEmail.trim();
  if (!email) {
    return "Email is required.";
  }

  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex !== email.indexOf("@") || atIndex === email.length - 1) {
    return "Enter a valid email address.";
  }

  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1).toLowerCase();

  if (
    localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
  ) {
    return "Enter a valid email address.";
  }

  const labels = domainPart.split(".");
  if (labels.length < 2) {
    return "Email domain must include a valid ending (for example .com or .bg).";
  }

  for (const label of labels) {
    if (!label) {
      return "Invalid email domain.";
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return "Email domain labels cannot start or end with a hyphen.";
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return "Email domain labels can only use letters, numbers, and hyphens.";
    }
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) {
    return "Email ending is not valid.";
  }

  return null;
}

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: SignupField) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: SignupFieldErrors = {};

    if (!firstName.trim()) nextErrors.first_name = "First name is required.";
    if (!lastName.trim()) nextErrors.last_name = "Last name is required.";
    const emailError = validateEmailAddress(email);
    if (emailError) {
      nextErrors.email = emailError;
    }

    const hasMinLength = password.length >= 8;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    if (!hasMinLength || !hasLower || !hasUpper || !hasNumber || !hasSpecial) {
      nextErrors.password = "Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, a number, and a special character.";
    }
    if (password !== confirmPassword) {
      nextErrors.password_confirm = "Passwords do not match.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      password,
      password_confirm: confirmPassword,
    };
    sessionStorage.setItem("signup_draft", JSON.stringify(payload));
    try {
      const response = await apiFetch("/api/accounts/signup/email-code/", {
        method: "POST",
        body: JSON.stringify({
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const nextErrors: SignupFieldErrors = {};
        if (Array.isArray(data.email)) {
          nextErrors.email = data.email[0];
        } else if (typeof data.email === "string") {
          nextErrors.email = data.email;
        } else if (typeof data.detail === "string") {
          nextErrors.form = data.detail;
        } else {
          nextErrors.form = "Could not send the confirmation code. Try again.";
        }
        setFieldErrors(nextErrors);
        setSubmitting(false);
        return;
      }
      window.location.href = "/signup/confirm-email";
    } catch {
      setFieldErrors({ form: "Could not send the confirmation code. Check your connection and try again." });
      setSubmitting(false);
    }
  }

  const passwordChecks = [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "At least one uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", passed: /[a-z]/.test(password) },
    { label: "At least one number", passed: /\d/.test(password) },
    { label: "At least one special character", passed: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>
        <div className="auth-heading">
          <h1>Create account</h1>
        </div>

        <div className="login-choice-actions signup-social-block" aria-label="Social sign up">
          <button className="auth-choice-button social-auth-btn" type="button">
            <span className="social-google-g" aria-hidden>G</span>
            <span>Google</span>
          </button>
          <button className="auth-choice-button social-auth-btn" type="button">
            <Apple size={24} aria-hidden />
            <span>Apple</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={submitSignup} noValidate>
          <div className="form-grid signup-form-grid">
            <label>
              <span>First name</span>
              <input
                autoComplete="given-name"
                aria-invalid={Boolean(fieldErrors.first_name)}
                className={fieldErrors.first_name ? "input-invalid" : ""}
                required
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  clearFieldError("first_name");
                }}
              />
              {fieldErrors.first_name ? <small className="field-error-text">{fieldErrors.first_name}</small> : null}
            </label>
            <label>
              <span>Last name</span>
              <input
                autoComplete="family-name"
                aria-invalid={Boolean(fieldErrors.last_name)}
                className={fieldErrors.last_name ? "input-invalid" : ""}
                required
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  clearFieldError("last_name");
                }}
              />
              {fieldErrors.last_name ? <small className="field-error-text">{fieldErrors.last_name}</small> : null}
            </label>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                className={fieldErrors.email ? "input-invalid" : ""}
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError("email");
                }}
              />
              {fieldErrors.email ? <small className="field-error-text">{fieldErrors.email}</small> : null}
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
                className={fieldErrors.password ? "input-invalid" : ""}
                minLength={8}
                required
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldError("password");
                }}
                placeholder="At least 8 characters"
              />
              {fieldErrors.password ? <small className="field-error-text">{fieldErrors.password}</small> : null}
              {password.length > 0 ? (
                <ul className="password-checklist" aria-live="polite">
                  {passwordChecks.map((rule) => (
                    <li
                      key={rule.label}
                      className={rule.passed ? "password-check-item passed" : "password-check-item failed"}
                    >
                      <span className="password-check-icon" aria-hidden>{rule.passed ? "✓" : "✕"}</span>
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <label>
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password_confirm)}
                className={fieldErrors.password_confirm ? "input-invalid" : ""}
                minLength={8}
                required
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearFieldError("password_confirm");
                }}
              />
              {fieldErrors.password_confirm ? <small className="field-error-text">{fieldErrors.password_confirm}</small> : null}
            </label>
          </div>

          {fieldErrors.form ? <p className="form-error">{fieldErrors.form}</p> : null}
          {submitting ? (
            <div className="signup-loading-status" role="status" aria-live="polite">
              <span className="signup-loading-spinner" aria-hidden />
              <span>Sending confirmation code...</span>
            </div>
          ) : null}
          <button className="primary-link auth-submit" type="submit" disabled={submitting}>
            <UserRoundCheck size={18} aria-hidden />
            {submitting ? "Sending code" : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}

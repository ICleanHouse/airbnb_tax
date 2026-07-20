"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { apiFetch } from "../lib/api";

type CancelledJob = {
  id: number;
  status: "cancelled";
  cancelled_at?: string | null;
  cancellation_reason_code?: string;
  cancellation_notice_band?: string;
  available_actions?: string[];
};

type ApiError = {
  code?: string;
  detail?: string;
  fields?: Record<string, string[] | string>;
};

type Props = {
  jobId: number;
  jobTitle: string;
  onClose: () => void;
  onCancelled: (job: CancelledJob) => void | Promise<void>;
};

const REASONS = [
  "host_change",
  "property_unavailable",
  "cleaner_unavailable",
  "illness",
  "safety",
  "access",
  "no_show",
  "scheduling_error",
  "other",
] as const;

function firstFieldError(value: string[] | string | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default function CancelJobDialog({ jobId, jobTitle, onClose, onCancelled }: Props) {
  const t = useTranslations("components.cancelJobDialog");
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    reasonRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  async function submit() {
    setError("");
    setReasonError("");
    setNoteError("");
    if (!reasonCode) {
      setReasonError(t("errors.reasonRequired"));
      reasonRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/marketplace/jobs/${jobId}/cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason_code: reasonCode, note }),
      });
      const data = (await response.json().catch(() => null)) as (CancelledJob & ApiError) | null;
      if (!response.ok) {
        setReasonError(firstFieldError(data?.fields?.reason_code));
        setNoteError(firstFieldError(data?.fields?.note));
        const knownCode = data?.code && [
          "agency_recovery_not_supported",
          "account_not_eligible",
          "job_already_terminal",
          "transition_conflict",
          "invalid_input",
          "not_found",
          "rate_limited",
        ].includes(data.code);
        setError(knownCode ? t(`errors.${data?.code}`) : t("errors.cancelFailed"));
        return;
      }
      if (data) await onCancelled(data);
      onClose();
    } catch {
      setError(t("errors.cancelFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="host-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="host-modal cancel-job-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-job-title"
        aria-describedby="cancel-job-description"
      >
        <div className="host-modal-header">
          <div>
            <h2 id="cancel-job-title">{t("heading")}</h2>
            <p id="cancel-job-description" className="host-modal-subtitle">
              {t("description", { title: jobTitle })}
            </p>
          </div>
          <button
            type="button"
            className="host-modal-close"
            onClick={onClose}
            aria-label={t("closeAriaLabel")}
            disabled={submitting}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="cancel-job-modal-body">
          <label className="host-field-label" htmlFor="cancel-job-reason">
            {t("reasonLabel")}
          </label>
          <select
            ref={reasonRef}
            id="cancel-job-reason"
            className="host-field-input"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
            aria-invalid={Boolean(reasonError)}
            aria-describedby={reasonError ? "cancel-job-reason-error" : undefined}
            disabled={submitting}
          >
            <option value="">{t("reasonPlaceholder")}</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>{t(`reasons.${reason}`)}</option>
            ))}
          </select>
          {reasonError ? <p id="cancel-job-reason-error" className="form-error">{reasonError}</p> : null}

          <label className="host-field-label" htmlFor="cancel-job-note">
            {t("noteLabel")}
          </label>
          <textarea
            id="cancel-job-note"
            className="host-field-input cancel-job-note"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            aria-invalid={Boolean(noteError)}
            aria-describedby={
              noteError
                ? "cancel-job-note-hint cancel-job-note-error"
                : "cancel-job-note-hint"
            }
            disabled={submitting}
          />
          <p id="cancel-job-note-hint" className="host-modal-subtitle">{t("noteHint")}</p>
          {noteError ? <p id="cancel-job-note-error" className="form-error">{noteError}</p> : null}
          <div aria-live="polite" role="status">
            {error ? <p className="form-error">{error}</p> : null}
          </div>
          <div className="host-form-actions">
            <button type="button" className="secondary-link" onClick={onClose} disabled={submitting}>
              {t("keepJob")}
            </button>
            <button type="button" className="account-delete-button" onClick={() => void submit()} disabled={submitting}>
              {submitting ? t("cancelling") : t("confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

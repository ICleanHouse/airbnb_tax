"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useRefocusClickGuard } from "../lib/useRefocusClickGuard";

type AccountDeletionPanelProps = {
  email: string;
};

export default function AccountDeletionPanel({ email }: AccountDeletionPanelProps) {
  const t = useTranslations("components.accountDeletionPanel");
  const shouldSuppressModalOpen = useRefocusClickGuard();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const deletingRef = useRef(false);

  useEffect(() => {
    deletingRef.current = deleting;
  }, [deleting]);

  useEffect(() => {
    if (!confirmOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deletingRef.current) {
        event.preventDefault();
        setConfirmOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [confirmOpen]);

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const response = await apiFetch("/api/accounts/me/", { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as {
          code?: string;
          fields?: { support_channel?: string; support_hours?: string };
        } | null;
        if (data?.code === "account_deletion_blocked_active_obligations") {
          setError(t("errors.activeObligations"));
        } else if (data?.code === "account_deletion_requires_support") {
          setError(t("errors.requiresSupport", {
            channel: data.fields?.support_channel || t("errors.supportFallback"),
            hours: data.fields?.support_hours || t("errors.supportHoursFallback"),
          }));
        } else {
          setError(t("errors.deleteFailed"));
        }
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="account-danger-zone" aria-labelledby="delete-account-title">
      <div>
        <h2 id="delete-account-title">{t("heading")}</h2>
        <p>{t("description")}</p>
      </div>
      <button
        type="button"
        className="account-delete-button"
        onClick={() => {
          if (shouldSuppressModalOpen()) return;
          setError("");
          setConfirmOpen(true);
        }}
      >
        <Trash2 size={16} aria-hidden />
        {t("deleteBtn")}
      </button>
      <div aria-live="polite" role="status">
        {error && !confirmOpen ? <p className="form-error account-delete-error">{error}</p> : null}
      </div>

      {confirmOpen ? (
        <div
          className="host-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmOpen(false);
          }}
        >
          <div
            ref={modalRef}
            className="host-modal account-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-confirm-title"
            aria-describedby="delete-account-confirm-description"
          >
            <div className="host-modal-header">
              <div>
                <h2 id="delete-account-confirm-title">{t("confirmHeading")}</h2>
                <p className="host-modal-subtitle">{t("confirmSubtitle", { email })}</p>
              </div>
              <button
                type="button"
                className="host-modal-close"
                onClick={() => setConfirmOpen(false)}
                aria-label={t("closeAriaLabel")}
                disabled={deleting}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="account-delete-modal-body">
              <p id="delete-account-confirm-description">{t("confirmBody")}</p>
              <div aria-live="polite" role="status">
                {error ? <p className="form-error">{error}</p> : null}
              </div>
              <div className="host-form-actions">
                <button
                  ref={cancelRef}
                  className="secondary-link"
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={deleting}
                >
                  {t("cancelBtn")}
                </button>
                <button
                  className="account-delete-button account-delete-button--confirm"
                  type="button"
                  onClick={() => void deleteAccount()}
                  disabled={deleting}
                >
                  <Trash2 size={16} aria-hidden />
                  {deleting ? t("deleting") : t("confirmBtn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

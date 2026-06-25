"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/api";

type AccountDeletionPanelProps = {
  email: string;
};

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export default function AccountDeletionPanel({ email }: AccountDeletionPanelProps) {
  const t = useTranslations("components.accountDeletionPanel");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const response = await apiFetch("/api/accounts/me/", { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(errorMessage(data, t("errors.deleteFailed")));
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
          setError("");
          setConfirmOpen(true);
        }}
      >
        <Trash2 size={16} aria-hidden />
        {t("deleteBtn")}
      </button>
      {error ? <p className="form-error account-delete-error">{error}</p> : null}

      {confirmOpen ? (
        <div
          className="host-modal-backdrop"
          onClick={() => !deleting && setConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-confirm-title"
        >
          <div className="host-modal account-delete-modal" onClick={(event) => event.stopPropagation()}>
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
              <p>{t("confirmBody")}</p>
              {error ? <p className="form-error">{error}</p> : null}
              <div className="host-form-actions">
                <button
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

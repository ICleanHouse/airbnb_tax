"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { apiFetch } from "../lib/api";

export type PendingReplacementRequest = {
  id: number;
  status: "pending_host_authorization";
  expires_at: string;
};

export function ReplacementAuthorizationActions({
  jobId,
  replacementRequest,
  onComplete,
}: {
  jobId: number;
  replacementRequest?: PendingReplacementRequest | null;
  onComplete?: () => void;
}) {
  const t = useTranslations("recovery");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!replacementRequest || replacementRequest.status !== "pending_host_authorization") return null;
  const replacementRequestId = replacementRequest.id;

  async function respond(accept: boolean) {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/marketplace/jobs/${jobId}/replacement-respond/`, {
        method: "POST",
        body: JSON.stringify({ replacement_request_id: replacementRequestId, accept }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { detail?: string } | null;
        setError(data?.detail || t("authorizationError"));
        return;
      }
      onComplete?.();
    } catch {
      setError(t("authorizationError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="recovery-actions replacement-authorization" aria-label={t("authorizationTitle")}>
      <h3>{t("authorizationTitle")}</h3>
      <p>{t("authorizationDescription")}</p>
      <div className="recovery-action-list">
        <button type="button" onClick={() => void respond(true)} disabled={saving}>
          {saving ? t("saving") : t("authorize")}
        </button>
        <button type="button" onClick={() => void respond(false)} disabled={saving}>
          {t("decline")}
        </button>
      </div>
      {error ? <p className="form-error" aria-live="polite">{error}</p> : null}
    </section>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

import { apiFetch } from "../lib/api";

type RecoveryAction = "reschedule" | "report_incident" | "file_dispute" | "request_replacement";

export function RecoveryActions({ jobId, actions, onComplete }: {
  jobId: number;
  actions?: string[];
  onComplete?: () => void;
}) {
  const t = useTranslations("recovery");
  const [mode, setMode] = useState<RecoveryAction | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [kind, setKind] = useState("attendance_failure");
  const [category, setCategory] = useState("quality");
  const [narrative, setNarrative] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availableActions = actions ?? [];

  if (!availableActions.some((action) => ["reschedule", "report_incident", "file_dispute", "request_replacement"].includes(action))) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode) return;
    setSaving(true); setError("");
    const endpoint = mode === "reschedule" ? "reschedule" : mode === "report_incident" ? "incidents" : mode === "file_dispute" ? "disputes" : "replacement-requests";
    const payload = mode === "reschedule"
      ? { scheduled_start: new Date(start).toISOString(), scheduled_end: new Date(end).toISOString() }
      : mode === "report_incident" ? { incident_type: kind, narrative }
      : mode === "file_dispute" ? { category, narrative }
      : { incident_id: Number(incidentId) };
    try {
      const response = await apiFetch(`/api/marketplace/jobs/${jobId}/${endpoint}/`, { method: "POST", body: JSON.stringify(payload) });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { detail?: string } | null;
        setError(data?.detail || t("error"));
        return;
      }
      setMode(null); setNarrative(""); setIncidentId(""); onComplete?.();
    } finally { setSaving(false); }
  }

  return <section className="recovery-actions" aria-label={t("title")}>
    <div className="recovery-action-list">
      {availableActions.includes("reschedule") && <button type="button" onClick={() => setMode("reschedule")}>{t("reschedule")}</button>}
      {availableActions.includes("report_incident") && <button type="button" onClick={() => setMode("report_incident")}>{t("incident")}</button>}
      {availableActions.includes("request_replacement") && <button type="button" onClick={() => setMode("request_replacement")}>{t("replacement")}</button>}
      {availableActions.includes("file_dispute") && <button type="button" onClick={() => setMode("file_dispute")}>{t("dispute")}</button>}
    </div>
    {mode && <form className="recovery-form" onSubmit={(event) => void submit(event)}>
      <h3>{mode === "reschedule" ? t("rescheduleTitle") : mode === "report_incident" ? t("incidentTitle") : mode === "request_replacement" ? t("replacementTitle") : t("disputeTitle")}</h3>
      {mode === "reschedule" && <><label>{t("start")}<input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>{t("end")}<input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label></>}
      {mode === "report_incident" && <><label>{t("type")}<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="attendance_failure">{t("attendanceFailure")}</option><option value="no_show">{t("noShow")}</option></select></label><label>{t("privateDetails")}<textarea required maxLength={5000} value={narrative} onChange={(e) => setNarrative(e.target.value)} /></label></>}
      {mode === "file_dispute" && <><label>{t("category")}<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="quality">{t("quality")}</option><option value="access">{t("access")}</option><option value="safety">{t("safety")}</option><option value="other">{t("other")}</option></select></label><label>{t("privateDetails")}<textarea required maxLength={5000} value={narrative} onChange={(e) => setNarrative(e.target.value)} /></label></>}
      {mode === "request_replacement" && <label>{t("incidentId")}<input required inputMode="numeric" value={incidentId} onChange={(e) => setIncidentId(e.target.value)} /></label>}
      {error && <p className="form-error" aria-live="polite">{error}</p>}
      <div><button type="button" onClick={() => setMode(null)}>{t("cancel")}</button><button type="submit" disabled={saving}>{saving ? t("saving") : t("submit")}</button></div>
    </form>}
  </section>;
}

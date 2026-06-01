"use client";

import { useState } from "react";
import { X, Send } from "lucide-react";
import { apiFetch } from "../../lib/api";

export interface OfferProperty {
  id: number;
  name: string;
  city: string;
  default_price_eur: string | null;
}

interface JobOfferModalProps {
  cleanerUserId: number;
  cleanerName: string;
  properties: OfferProperty[];
  onClose: () => void;
  onOffered?: () => void;
}

/**
 * Lets a host send a direct job offer to a specific cleaner. Creates a draft
 * CleaningJob from the picked property + date/time + price, then immediately
 * offers it to the cleaner (origin=host_offered) via the job `offer` action.
 */
export default function JobOfferModal({
  cleanerUserId,
  cleanerName,
  properties,
  onClose,
  onOffered,
}: JobOfferModalProps) {
  const [propId, setPropId] = useState<string>(properties[0] ? String(properties[0].id) : "");
  const [title, setTitle] = useState("Turnover cleaning");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("11:00");
  const [endTime, setEndTime] = useState("14:00");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!propId) {
      setError("Please pick a property first.");
      return;
    }
    if (!date) {
      setError("Please choose a cleaning date.");
      return;
    }
    const startIso = new Date(`${date}T${startTime}`).toISOString();
    const endIso = new Date(`${date}T${endTime}`).toISOString();
    if (endIso <= startIso) {
      setError("End time must be after the start time.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create the job as a draft.
      const jobRes = await apiFetch("/api/marketplace/jobs/", {
        method: "POST",
        body: JSON.stringify({
          property_id: parseInt(propId, 10),
          title,
          scheduled_start: startIso,
          scheduled_end: endIso,
          proposed_price: price ? price : null,
        }),
      });
      if (!jobRes.ok) {
        const data = await jobRes.json().catch(() => ({}));
        setError(data.detail ?? "Could not create the job.");
        return;
      }
      const job = (await jobRes.json()) as { id: number };

      // 2. Offer the freshly created job to the chosen cleaner.
      const offerRes = await apiFetch(`/api/marketplace/jobs/${job.id}/offer/`, {
        method: "POST",
        body: JSON.stringify({
          cleaner_id: cleanerUserId,
          proposed_price: price ? price : null,
          message,
        }),
      });
      if (!offerRes.ok) {
        const data = await offerRes.json().catch(() => ({}));
        setError(data.detail ?? "Could not send the offer.");
        return;
      }
      onOffered?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="host-modal-backdrop" onClick={onClose}>
      <div className="host-modal" onClick={(e) => e.stopPropagation()}>
        <div className="host-modal-header">
          <h3>Offer a job to {cleanerName}</h3>
          <button type="button" className="host-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="host-form">
          {error && <p className="form-error">{error}</p>}

          <label className="host-offer-field">
            <span>Property</span>
            <select value={propId} onChange={(e) => setPropId(e.target.value)}>
              {properties.length === 0 && <option value="">No properties yet</option>}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.city}
                </option>
              ))}
            </select>
          </label>

          <label className="host-offer-field">
            <span>Job title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Turnover cleaning" />
          </label>

          <div className="host-offer-row">
            <label className="host-offer-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="host-offer-field">
              <span>Start</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="host-offer-field">
              <span>End</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>

          <label className="host-offer-field">
            <span>Offered price (EUR)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 50"
            />
          </label>

          <label className="host-offer-field">
            <span>Message (optional)</span>
            <textarea
              className="host-review-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note for the cleaner…"
              rows={3}
            />
          </label>

          <div className="host-form-actions">
            <button type="button" className="secondary-link" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="primary-link" onClick={() => void submit()} disabled={submitting}>
              <Send size={15} aria-hidden /> {submitting ? "Sending…" : "Send offer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

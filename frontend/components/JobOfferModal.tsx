"use client";

import { useState } from "react";
import { X, Send } from "lucide-react";
import { apiFetch } from "../lib/api";

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

/** Pull a human-readable message out of a DRF error body (detail or non_field_errors). */
function extractError(data: unknown): string | null {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    const nfe = d.non_field_errors;
    if (Array.isArray(nfe) && typeof nfe[0] === "string") return nfe[0];
  }
  return null;
}

/**
 * Lets a host send a direct job offer to a specific cleaner. Reuses an existing
 * CleaningJob for the same property + exact time slot when one exists (e.g. a
 * draft left over from a previously declined offer), otherwise creates a draft
 * job, then offers it to the cleaner (origin=host_offered) via the job `offer`
 * action. The backend `offer_job` service blocks duplicate pending offers and
 * re-activates declined ones.
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
      // Single server-side call: the backend finds-or-creates the draft job for
      // this exact (property, start, end) slot — reusing a draft left from a
      // previously declined offer instead of creating a duplicate (which would
      // 400 on the unique-slot constraint) — then offers it. `offer_job` blocks a
      // duplicate *pending* offer with a clear message and re-activates a declined
      // one, so no client-side slot matching is needed.
      const res = await apiFetch("/api/marketplace/jobs/offer-to-cleaner/", {
        method: "POST",
        body: JSON.stringify({
          property_id: parseInt(propId, 10),
          cleaner_id: cleanerUserId,
          title,
          scheduled_start: startIso,
          scheduled_end: endIso,
          proposed_price: price ? price : null,
          message,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(extractError(data) ?? "Could not send the offer.");
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

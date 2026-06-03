"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "../lib/api";

const CONSENT_KEY = "host-cleaners-cookie-consent";
const VISITOR_KEY = "host-cleaners-visitor-id";

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) {
    return existing;
  }
  const generated =
    typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(VISITOR_KEY, generated);
  return generated;
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(CONSENT_KEY) !== "saved");
  }, []);

  async function saveConsent(analytics: boolean, marketing: boolean) {
    setSaving(true);
    window.localStorage.setItem(CONSENT_KEY, "saved");
    setVisible(false);

    try {
      await apiFetch("/api/accounts/cookie-consent/", {
        method: "POST",
        body: JSON.stringify({
          visitor_id: getVisitorId(),
          consent_version: "v1",
          policy_version: "v1",
          essential: true,
          analytics,
          marketing,
          source: "banner",
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <aside className="cookie-banner" aria-label="Cookie consent">
      <div className="cookie-icon" aria-hidden>
        <ShieldCheck size={20} />
      </div>
      <div>
        <h2>Cookie choices</h2>
        <p>
          Essential cookies keep login and security working. Analytics and marketing cookies stay
          off unless you allow them.
        </p>
      </div>
      <div className="cookie-actions">
        <button type="button" onClick={() => saveConsent(false, false)} disabled={saving}>
          <X size={16} aria-hidden />
          Essential only
        </button>
        <button
          className="primary-cookie-action"
          type="button"
          onClick={() => saveConsent(true, true)}
          disabled={saving}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Accept optional
        </button>
      </div>
    </aside>
  );
}

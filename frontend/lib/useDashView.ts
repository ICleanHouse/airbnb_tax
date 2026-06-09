"use client";

import { useEffect, useState } from "react";

export type DashView = "bento" | "donut";

const STORAGE_KEY = "hc:dashView";
const DEFAULT_VIEW: DashView = "bento";

/**
 * Persisted preference for the Applications dashboard hero layout.
 * Defaults to the money-hero "bento"; the donut is opt-in. Stored per-browser
 * in localStorage and shared across the host and cleaner dashboards.
 *
 * Reads the stored value in an effect (not during render) to avoid an SSR /
 * hydration mismatch — first paint always uses the default.
 */
export function useDashView(): [DashView, (view: DashView) => void] {
  const [view, setView] = useState<DashView>(DEFAULT_VIEW);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "bento" || stored === "donut") setView(stored);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  function update(next: DashView) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence errors */
    }
  }

  return [view, update];
}

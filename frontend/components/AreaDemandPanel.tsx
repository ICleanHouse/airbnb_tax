"use client";

import { useEffect, useState } from "react";
import { Briefcase, MapPin, Sparkles, Users } from "lucide-react";
import { apiFetch } from "../lib/api";
import { cities } from "../lib/cityDistricts";

interface AreaStats {
  city: string;
  verified_cleaners: number;
  active_hosts: number;
  open_jobs: number;
  jobs_this_week: number;
  jobs_this_month: number;
}

/**
 * "Find cleaning work" side of the landing audience toggle. Shows privacy-safe
 * aggregate demand for the selected city (no host identities) sourced from
 * GET /api/marketplace/area-stats/, plus a "Join as a cleaner" CTA that
 * deep-links signup with the cleaner role preselected.
 */
export default function AreaDemandPanel() {
  const [cityLabel, setCityLabel] = useState("");
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = cityLabel ? `?city=${encodeURIComponent(cityLabel)}` : "";
    apiFetch(`/api/marketplace/area-stats/${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AreaStats | null) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityLabel]);

  const where = cityLabel || "Bulgaria";
  const cards = [
    { icon: Users, value: stats?.active_hosts ?? 0, label: "Hosts hiring", tone: "teal" as const },
    { icon: Briefcase, value: stats?.open_jobs ?? 0, label: "Open jobs", tone: "brand" as const },
    { icon: Sparkles, value: stats?.jobs_this_week ?? 0, label: "Posted this week", tone: "gold" as const },
  ];

  return (
    <div className="area-demand">
      <div className="area-demand-head">
        <label className="area-demand-field" aria-label="City">
          <span>
            <MapPin size={13} aria-hidden /> Area
          </span>
          <select value={cityLabel} onChange={(e) => setCityLabel(e.target.value)}>
            <option value="">All of Bulgaria</option>
            {cities.map((c) => (
              <option key={c.value} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="area-demand-caption">
          Live cleaning demand in <strong>{where}</strong>
        </p>
      </div>

      <div className={`area-demand-grid${loading ? " area-demand-grid--loading" : ""}`}>
        {cards.map(({ icon: Icon, value, label, tone }) => (
          <div className={`area-demand-card area-demand-card--${tone}`} key={label}>
            <Icon size={18} aria-hidden />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="area-demand-cta">
        <p>
          <strong>{stats?.verified_cleaners ?? 0}</strong> verified cleaners already work here.
          Add your profile and start getting jobs.
        </p>
        <a className="primary-link" href="/signup?role=cleaner">
          <Sparkles size={15} aria-hidden />
          Join as a cleaner
        </a>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "../lib/api";
import type { CurrentUser } from "../lib/api";
import { cities } from "../lib/cityDistricts";
import OpenJobMap from "./OpenJobMap";

interface AreaStats {
  city: string;
  verified_cleaners: number;
  active_hosts: number;
  open_jobs: number;
  jobs_this_week: number;
  jobs_this_month: number;
}

type CityChangeSource = "select" | "map";

/**
 * "Find cleaning work" side of the landing audience toggle. Shows privacy-safe
 * aggregate demand for the selected city (no host identities) sourced from
 * GET /api/marketplace/area-stats/, plus a "Join as a cleaner" CTA that
 * deep-links signup with the cleaner role preselected.
 */
export default function AreaDemandPanel({ currentUser }: { currentUser: CurrentUser | null }) {
  const t = useTranslations("components.areaDemandPanel");
  const [cityLabel, setCityLabel] = useState("");
  const [cityChangeSource, setCityChangeSource] = useState<CityChangeSource>("select");
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [loading, setLoading] = useState(true);

  const selectCity = useCallback((nextCityLabel: string) => {
    setCityChangeSource("select");
    setCityLabel(nextCityLabel);
  }, []);

  const selectCityFromMap = useCallback((nextCityLabel: string) => {
    setCityChangeSource("map");
    setCityLabel(nextCityLabel);
  }, []);

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

  const where = cityLabel || t("defaultCity");
  const cards = [
    { icon: Users, value: stats?.active_hosts ?? 0, label: t("hostsHiring"), tone: "teal" as const },
    { icon: Briefcase, value: stats?.open_jobs ?? 0, label: t("openJobs"), tone: "brand" as const },
    { icon: Sparkles, value: stats?.jobs_this_week ?? 0, label: t("postedThisWeek"), tone: "gold" as const },
  ];

  return (
    <div className="area-demand">
      <div className="area-demand-head">
        <label className="area-demand-field" aria-label={t("cityAriaLabel")}>
          <select value={cityLabel} onChange={(e) => selectCity(e.target.value)}>
            <option value="">{t("allBulgaria")}</option>
            {cities.map((c) => (
              <option key={c.value} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="area-demand-caption">
          {t("demandCaption", { city: where })}
        </p>
      </div>

      <OpenJobMap
        cityLabel={cityLabel}
        cityChangeSource={cityChangeSource}
        currentUser={currentUser}
        onCityChange={selectCityFromMap}
      />

      <div className={`area-demand-grid${loading ? " area-demand-grid--loading" : ""}`}>
        {cards.map(({ icon: Icon, value, label, tone }) => (
          <div className={`area-demand-card area-demand-card--${tone}`} key={label}>
            <Icon size={18} aria-hidden />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {!currentUser ? (
        <div className="area-demand-cta">
          <p>{t("ctaText", { count: stats?.verified_cleaners ?? 0 })}</p>
          <Link className="primary-link" href="/signup?role=cleaner">
            <Sparkles size={15} aria-hidden />
            {t("joinAsCleaner")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

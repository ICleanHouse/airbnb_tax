"use client";

import { Wallet, Clock, Briefcase, CheckCircle2, ClipboardList, Star } from "lucide-react";
import StatusDonut from "./StatusDonut";
import type { DashView } from "../lib/useDashView";

export type AppFilter = "pending" | "active" | "completed" | "open" | "rating" | null;

export interface AppdashGridProps {
  view: DashView;
  appFilter: AppFilter;
  setAppFilter: (f: AppFilter) => void;
  pending: number;
  active: number;
  completed: number;
  open: number;
  /** Sub-label for the Open tile (host: "awaiting cleaners", cleaner: "to apply"). */
  openSub: string;
  rating: number | null;
  ratingCount: number;
  moneyLabel: string;   // "Spent" | "Income"
  moneyValue: string;   // pre-formatted currency
  moneyCount: number;   // completed cleanings count
}

/**
 * The Applications summary grid, rendered either as the money-hero "bento"
 * (default) or as the pipeline "donut". Shared by the host and cleaner
 * dashboards so both stay in sync; purely presentational — the parent owns
 * `appFilter` state and the data.
 */
export default function AppdashGrid({
  view,
  appFilter,
  setAppFilter,
  pending,
  active,
  completed,
  open,
  openSub,
  rating,
  ratingCount,
  moneyLabel,
  moneyValue,
  moneyCount,
}: AppdashGridProps) {
  const ratingSub =
    ratingCount > 0 ? `${ratingCount} review${ratingCount !== 1 ? "s" : ""} received` : "no reviews yet";
  const moneySub =
    moneyCount > 0 ? `from ${moneyCount} cleaning${moneyCount !== 1 ? "s" : ""}` : "no completed jobs yet";

  function toggle(key: Exclude<AppFilter, null>) {
    setAppFilter(appFilter === key ? null : key);
  }

  const ratingTile = (
    <button
      type="button"
      className={`host-appdash-card host-appdash-card--gold${appFilter === "rating" ? " host-appdash-card--active" : ""}`}
      onClick={() => toggle("rating")}
    >
      <span className="host-appdash-chip host-appdash-chip--gold"><Star size={17} aria-hidden /></span>
      <span className="host-appdash-label">My rating</span>
      <strong className="host-appdash-value host-appdash-value--rating">
        {rating !== null ? rating.toFixed(1) : "—"}
      </strong>
      <span className="host-appdash-sub">{ratingSub}</span>
    </button>
  );

  const moneyTile = (
    <div className="host-appdash-card host-appdash-card--money host-appdash-card--static">
      <span className="host-appdash-chip host-appdash-chip--teal"><Wallet size={17} aria-hidden /></span>
      <span className="host-appdash-label">{moneyLabel}</span>
      <strong className="host-appdash-value host-appdash-value--money">{moneyValue}</strong>
      <span className="host-appdash-sub">{moneySub}</span>
    </div>
  );

  if (view === "donut") {
    const segs = [
      { key: "pending" as const, label: "Pending", color: "var(--brand)", value: pending },
      { key: "active" as const, label: "Active", color: "var(--gold)", value: active },
      { key: "completed" as const, label: "Completed", color: "#22c55e", value: completed },
      { key: "open" as const, label: "Open", color: "var(--teal)", value: open },
    ];
    const total = pending + active + completed + open;
    return (
      <div className="host-appdash-grid host-appdash-grid--donut">
        <div
          className="host-appdash-card host-appdash-card--hero host-appdash-hero-donut"
          role="button"
          tabIndex={0}
          title="Show everything"
          onClick={() => setAppFilter(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAppFilter(null);
            }
          }}
        >
          <StatusDonut
            segments={segs.map((s) => ({ value: s.value, color: s.color }))}
            centerTop={total}
            centerBottom="in pipeline"
          />
          <div className="host-appdash-legend">
            <span className="host-appdash-legend-title">Job pipeline</span>
            {segs.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`host-appdash-legend-row${appFilter === item.key ? " active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(item.key);
                }}
              >
                <span className="host-appdash-legend-dot" style={{ background: item.color }} />
                <span className="host-appdash-legend-label">{item.label}</span>
                <span className="host-appdash-legend-count">{item.value}</span>
              </button>
            ))}
          </div>
        </div>
        {ratingTile}
        {moneyTile}
      </div>
    );
  }

  // Default: money-hero bento (hero + 5 stat tiles).
  return (
    <div className="host-appdash-grid">
      <div className="host-appdash-card host-appdash-card--money host-appdash-card--static host-appdash-card--hero">
        <span className="host-appdash-chip host-appdash-chip--teal host-appdash-chip--lg"><Wallet size={22} aria-hidden /></span>
        <span className="host-appdash-label">{moneyLabel}</span>
        <strong className="host-appdash-value host-appdash-value--money">{moneyValue}</strong>
        <span className="host-appdash-sub">{moneySub}</span>
      </div>
      <button
        type="button"
        className={`host-appdash-card${appFilter === "pending" ? " host-appdash-card--active" : ""}`}
        onClick={() => toggle("pending")}
      >
        <span className="host-appdash-chip host-appdash-chip--brand"><Clock size={17} aria-hidden /></span>
        <span className="host-appdash-label">Pending</span>
        <strong className="host-appdash-value">{pending}</strong>
        <span className="host-appdash-sub">applications</span>
      </button>
      <button
        type="button"
        className={`host-appdash-card host-appdash-card--gold${appFilter === "active" ? " host-appdash-card--active" : ""}`}
        onClick={() => toggle("active")}
      >
        <span className="host-appdash-chip host-appdash-chip--gold"><Briefcase size={17} aria-hidden /></span>
        <span className="host-appdash-label">Active</span>
        <strong className="host-appdash-value">{active}</strong>
        <span className="host-appdash-sub">assignments</span>
      </button>
      <button
        type="button"
        className={`host-appdash-card host-appdash-card--green${appFilter === "completed" ? " host-appdash-card--active" : ""}`}
        onClick={() => toggle("completed")}
      >
        <span className="host-appdash-chip host-appdash-chip--green"><CheckCircle2 size={17} aria-hidden /></span>
        <span className="host-appdash-label">Completed</span>
        <strong className="host-appdash-value">{completed}</strong>
        <span className="host-appdash-sub">cleanings</span>
      </button>
      <button
        type="button"
        className={`host-appdash-card host-appdash-card--teal${appFilter === "open" ? " host-appdash-card--active" : ""}`}
        onClick={() => toggle("open")}
      >
        <span className="host-appdash-chip host-appdash-chip--teal"><ClipboardList size={17} aria-hidden /></span>
        <span className="host-appdash-label">Open jobs</span>
        <strong className="host-appdash-value">{open}</strong>
        <span className="host-appdash-sub">{openSub}</span>
      </button>
      {ratingTile}
    </div>
  );
}

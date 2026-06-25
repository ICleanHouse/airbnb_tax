"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Wallet, Clock, Briefcase, CheckCircle2, ClipboardList, Star, GripVertical, EyeOff, Plus } from "lucide-react";
import { ALL_APPDASH_CARDS, type AppdashCardKey } from "../lib/useAppdashPrefs";

export type AppFilter = "pending" | "active" | "completed" | "open" | "rating" | null;

export interface AppdashGridProps {
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
  // Customisation (synced to the account via useAppdashPrefs)
  cards: AppdashCardKey[];          // ordered, visible cards
  editing: boolean;
  onMove: (from: number, to: number) => void;
  onToggle: (key: AppdashCardKey) => void;
}

interface CardDescriptor {
  key: AppdashCardKey;
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  chipClass: string;
  variantClass: string;
  valueClass: string;
  /** Filter this card toggles; null = static (money). */
  filter: Exclude<AppFilter, null> | null;
}

/**
 * The Applications summary grid. Cards are user-customisable: each user picks
 * which categories show and in what order (persisted per account). Shared by the
 * host and cleaner dashboards so both stay in sync; purely presentational — the
 * parent owns `appFilter`, the data, and the layout prefs.
 */
export default function AppdashGrid({
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
  cards,
  editing,
  onMove,
  onToggle,
}: AppdashGridProps) {
  const t = useTranslations("components.appdashGrid");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const ratingSub = ratingCount > 0 ? t("ratingReceived", { count: ratingCount }) : t("noRatingYet");
  const moneySub = moneyCount > 0 ? t("fromCleanings", { count: moneyCount }) : t("noCompletedJobs");

  const catalog: Record<AppdashCardKey, CardDescriptor> = {
    money: {
      key: "money",
      label: moneyLabel,
      value: moneyValue,
      sub: moneySub,
      icon: <Wallet size={17} aria-hidden />,
      chipClass: "host-appdash-chip--teal",
      variantClass: "host-appdash-card--money host-appdash-card--static",
      valueClass: "host-appdash-value--money",
      filter: null,
    },
    pending: {
      key: "pending",
      label: t("pending"),
      value: String(pending),
      sub: t("pendingSub"),
      icon: <Clock size={17} aria-hidden />,
      chipClass: "host-appdash-chip--brand",
      variantClass: "",
      valueClass: "",
      filter: "pending",
    },
    active: {
      key: "active",
      label: t("active"),
      value: String(active),
      sub: t("activeSub"),
      icon: <Briefcase size={17} aria-hidden />,
      chipClass: "host-appdash-chip--gold",
      variantClass: "host-appdash-card--gold",
      valueClass: "",
      filter: "active",
    },
    completed: {
      key: "completed",
      label: t("completed"),
      value: String(completed),
      sub: t("completedSub"),
      icon: <CheckCircle2 size={17} aria-hidden />,
      chipClass: "host-appdash-chip--green",
      variantClass: "host-appdash-card--green",
      valueClass: "",
      filter: "completed",
    },
    open: {
      key: "open",
      label: t("openJobs"),
      value: String(open),
      sub: openSub,
      icon: <ClipboardList size={17} aria-hidden />,
      chipClass: "host-appdash-chip--teal",
      variantClass: "host-appdash-card--teal",
      valueClass: "",
      filter: "open",
    },
    rating: {
      key: "rating",
      label: t("myRating"),
      value: rating !== null ? rating.toFixed(1) : "—",
      sub: ratingSub,
      icon: <Star size={17} aria-hidden />,
      chipClass: "host-appdash-chip--gold",
      variantClass: "host-appdash-card--gold",
      valueClass: "host-appdash-value--rating",
      filter: "rating",
    },
  };

  function toggleFilter(key: Exclude<AppFilter, null>) {
    setAppFilter(appFilter === key ? null : key);
  }

  function cardInner(d: CardDescriptor) {
    return (
      <>
        <span className={`host-appdash-chip ${d.chipClass}`}>{d.icon}</span>
        <span className="host-appdash-label">{d.label}</span>
        <strong className={`host-appdash-value ${d.valueClass}`}>{d.value}</strong>
        <span className="host-appdash-sub">{d.sub}</span>
      </>
    );
  }

  // ── Read-only mode: render visible cards, clickable as filters ──
  if (!editing) {
    return (
      <div className="host-appdash-grid">
        {cards.map((key) => {
          const d = catalog[key];
          if (!d) return null;
          if (d.filter === null) {
            return (
              <div key={key} className={`host-appdash-card ${d.variantClass}`}>
                {cardInner(d)}
              </div>
            );
          }
          const isActive = appFilter === d.filter;
          return (
            <button
              key={key}
              type="button"
              className={`host-appdash-card ${d.variantClass}${isActive ? " host-appdash-card--active" : ""}`}
              onClick={() => toggleFilter(d.filter!)}
            >
              {cardInner(d)}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Edit mode: drag to reorder visible cards; toggle to show/hide ──
  const hidden = ALL_APPDASH_CARDS.filter((key) => !cards.includes(key));

  return (
    <div className="host-appdash-edit">
      <p className="host-appdash-edit-hint">{t("editHint")}</p>
      <div className="host-appdash-grid host-appdash-grid--editing">
        {cards.map((key, index) => {
          const d = catalog[key];
          if (!d) return null;
          return (
            <div
              key={key}
              className={`host-appdash-card ${d.variantClass} host-appdash-card--editing${dragIndex === index ? " host-appdash-card--dragging" : ""}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) onMove(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <span className="host-appdash-grip" aria-hidden><GripVertical size={15} /></span>
              <button
                type="button"
                className="host-appdash-eye"
                aria-label={t("hideCard", { label: d.label })}
                title={t("hideCard", { label: d.label })}
                onClick={() => onToggle(key)}
              >
                <EyeOff size={14} aria-hidden />
              </button>
              {cardInner(d)}
            </div>
          );
        })}
      </div>

      {hidden.length > 0 && (
        <div className="host-appdash-hidden">
          <span className="host-appdash-hidden-label">{t("hiddenCards")}</span>
          <div className="host-appdash-hidden-chips">
            {hidden.map((key) => (
              <button
                key={key}
                type="button"
                className="host-appdash-hidden-chip"
                onClick={() => onToggle(key)}
              >
                <Plus size={13} aria-hidden /> {catalog[key].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { apiFetch, type CurrentUser } from "./api";

/** Every Applications summary card, in default display order. */
export const ALL_APPDASH_CARDS = [
  "money",
  "pending",
  "active",
  "completed",
  "open",
  "rating",
] as const;

export type AppdashCardKey = (typeof ALL_APPDASH_CARDS)[number];

export const DEFAULT_APPDASH_CARDS: AppdashCardKey[] = [...ALL_APPDASH_CARDS];

function isCardKey(value: unknown): value is AppdashCardKey {
  return typeof value === "string" && (ALL_APPDASH_CARDS as readonly string[]).includes(value);
}

export interface AppdashPrefs {
  /** Visible cards, in display order. */
  cards: AppdashCardKey[];
  /** Whether the layout editor is open. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** Move a visible card from one index to another (drag reorder). */
  moveCard: (from: number, to: number) => void;
  /** Show or hide a card. */
  toggleCard: (key: AppdashCardKey) => void;
}

/**
 * Per-user Applications dashboard layout (which summary cards show + their
 * order), synced to the account via `User.dashboard_prefs.applications.cards`.
 * Shared by the host and cleaner dashboards. Hydrates from the loaded
 * `currentUser` and persists every change with a fire-and-forget PATCH.
 */
export function useAppdashPrefs(currentUser: CurrentUser | null): AppdashPrefs {
  const [cards, setCards] = useState<AppdashCardKey[]>(DEFAULT_APPDASH_CARDS);
  const [editing, setEditing] = useState(false);

  // Hydrate once the user (and their saved prefs) is available.
  useEffect(() => {
    const saved = currentUser?.dashboard_prefs?.applications?.cards;
    if (Array.isArray(saved)) {
      const valid = saved.filter(isCardKey);
      if (valid.length) setCards(valid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  function persist(next: AppdashCardKey[]) {
    setCards(next);
    if (!currentUser) return;
    const prefs = {
      ...(currentUser.dashboard_prefs ?? {}),
      applications: { ...(currentUser.dashboard_prefs?.applications ?? {}), cards: next },
    };
    // Keep the loaded user object in sync so a later re-hydrate doesn't revert.
    currentUser.dashboard_prefs = prefs;
    void apiFetch(`/api/accounts/users/${currentUser.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ dashboard_prefs: prefs }),
    });
  }

  function moveCard(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= cards.length || to >= cards.length) return;
    const next = [...cards];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

  function toggleCard(key: AppdashCardKey) {
    const next = cards.includes(key)
      ? cards.filter((k) => k !== key)
      : [...cards, key];
    persist(next);
  }

  return { cards, editing, setEditing, moveCard, toggleCard };
}

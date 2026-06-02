"use client";

import { useEffect, useRef } from "react";

type RefreshFn = () => void | Promise<void>;

interface LiveRefreshOptions {
  enabled?: boolean;
  intervalMs?: number | null;
}

export function useLiveRefresh(
  refresh: RefreshFn,
  { enabled = true, intervalMs = null }: LiveRefreshOptions = {},
) {
  const refreshRef = useRef<RefreshFn>(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const runRefresh = () => {
      if (document.visibilityState === "hidden") return;
      void refreshRef.current();
    };

    const intervalId = intervalMs && intervalMs > 0
      ? window.setInterval(runRefresh, intervalMs)
      : null;

    function handleFocus() {
      runRefresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    }

    function handleOnline() {
      runRefresh();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs]);
}

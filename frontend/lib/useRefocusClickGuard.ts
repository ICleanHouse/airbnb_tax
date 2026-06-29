"use client";

import { useEffect, useRef } from "react";

export function useRefocusClickGuard() {
  const suppressNextActivationRef = useRef(false);
  const cleanupRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    function clearSuppression() {
      suppressNextActivationRef.current = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    }

    function suppressForCurrentActivation() {
      clearSuppression();
      suppressNextActivationRef.current = true;

      const timeoutId = window.setTimeout(() => {
        clearSuppression();
      }, 1000);

      function swallowFirstClick(event: MouseEvent) {
        if (!suppressNextActivationRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearSuppression();
      }

      window.addEventListener("click", swallowFirstClick, true);
      cleanupRef.current = () => {
        window.clearTimeout(timeoutId);
        window.removeEventListener("click", swallowFirstClick, true);
      };
    }

    function handleFocus() {
      suppressForCurrentActivation();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        suppressForCurrentActivation();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearSuppression();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return () => suppressNextActivationRef.current;
}

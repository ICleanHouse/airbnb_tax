"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { event: "frontend.route_crashed" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="app-page">
      <section className="app-shell">
        <div className="auth-heading">
          <h1>Something went wrong</h1>
          <p>Refresh the page or try the action again.</p>
        </div>
        <button className="primary-link" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}

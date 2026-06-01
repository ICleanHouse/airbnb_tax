"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { event: "frontend.global_crashed" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="app-page">
          <section className="app-shell">
            <div className="auth-heading">
              <h1>Something went wrong</h1>
              <p>Refresh the page and try again.</p>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

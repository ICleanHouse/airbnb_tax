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
    <html lang="bg">
      <body>
        <main className="app-page">
          <section className="app-shell">
            <div className="auth-heading">
              {/* global-error renders outside NextIntlClientProvider — strings are hardcoded */}
              <h1>Нещо се обърка</h1>
              <p>Презаредете страницата и опитайте отново.</p>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

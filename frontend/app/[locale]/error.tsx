"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

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
          <h1>{t("heading")}</h1>
          <p>{t("body")}</p>
        </div>
        <button className="primary-link" type="button" onClick={reset}>
          {t("tryAgain")}
        </button>
      </section>
    </main>
  );
}
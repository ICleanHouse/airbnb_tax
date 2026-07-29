"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function PrivacyPage() {
  const locale = useLocale();
  const t = useTranslations("privacy");

  return (
    <main className="privacy-page">
      <div className="privacy-page__content">
        <Link className="privacy-page__back" href={`/${locale}`}>{t("back")}</Link>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="privacy-page__intro">{t("intro")}</p>

        <section>
          <h2>{t("purpose.title")}</h2>
          <p>{t("purpose.body")}</p>
        </section>
        <section>
          <h2>{t("data.title")}</h2>
          <p>{t("data.body")}</p>
        </section>
        <section>
          <h2>{t("processor.title")}</h2>
          <p>{t("processor.body")}</p>
        </section>
        <section>
          <h2>{t("retention.title")}</h2>
          <p>{t("retention.body")}</p>
        </section>
        <section>
          <h2>{t("choice.title")}</h2>
          <p>{t("choice.body")}</p>
        </section>
        <section>
          <h2>{t("rights.title")}</h2>
          <p>{t("rights.body")}</p>
        </section>
        <p className="privacy-page__review">{t("review")}</p>
      </div>
    </main>
  );
}

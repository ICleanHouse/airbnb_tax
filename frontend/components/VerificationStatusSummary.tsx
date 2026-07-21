"use client";

import { useTranslations } from "next-intl";

import type { CurrentUser } from "../types/user";

type CleanerMarketplaceStatus = "pending" | "verified" | "rejected" | "suspended";

interface VerificationStatusSummaryProps {
  user: CurrentUser;
  cleanerMarketplaceStatus?: CleanerMarketplaceStatus | null;
  compact?: boolean;
}

export default function VerificationStatusSummary({
  user,
  cleanerMarketplaceStatus,
  compact = false,
}: VerificationStatusSummaryProps) {
  const t = useTranslations("verificationStatus");
  const yesNo = (value: boolean | undefined) =>
    value ? t("states.confirmed") : t("states.incomplete");
  const marketplaceActive = Boolean(user.marketplace_eligible);
  const accountStatusText = {
    approved: t("accountStates.approved"),
    pending: t("accountStates.pending"),
    rejected: t("accountStates.rejected"),
    suspended: t("accountStates.suspended"),
  }[user.account_status];
  const cleanerMarketplaceText =
    cleanerMarketplaceStatus === "verified"
      ? t("states.accessActive")
      : cleanerMarketplaceStatus === "pending"
        ? t("states.pending")
        : cleanerMarketplaceStatus
          ? t("states.unavailable")
          : t("states.incomplete");

  return (
    <section
      className={`verification-summary${compact ? " verification-summary--compact" : ""}`}
      aria-labelledby={`verification-summary-${user.id}`}
    >
      <div className="verification-summary-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 id={`verification-summary-${user.id}`}>{t("title")}</h2>
        </div>
        <span className={`verification-access-chip${marketplaceActive ? " active" : ""}`}>
          {marketplaceActive ? t("states.accessActive") : t("states.accessLocked")}
        </span>
      </div>

      <dl className="verification-state-grid">
        <div>
          <dt>{t("labels.email")}</dt>
          <dd>{yesNo(user.email_verified)}</dd>
        </div>
        <div>
          <dt>{t("labels.phone")}</dt>
          <dd>
            {user.phone_verified
              ? t("states.confirmed")
              : user.phone_verification_required
                ? t("states.required")
                : t("states.planned")}
          </dd>
        </div>
        <div>
          <dt>{t("labels.contact")}</dt>
          <dd>{yesNo(user.contact_verified)}</dd>
        </div>
        <div>
          <dt>{t("labels.account")}</dt>
          <dd>{accountStatusText}</dd>
        </div>
        {user.role === "cleaner" && (
          <div>
            <dt>{t("labels.cleanerMarketplace")}</dt>
            <dd>{cleanerMarketplaceText}</dd>
          </div>
        )}
        <div>
          <dt>{t("labels.full")}</dt>
          <dd>{yesNo(user.fully_verified)}</dd>
        </div>
      </dl>

      {!user.phone_verification_required && (
        <p className="verification-policy-note">{t("interimPolicy")}</p>
      )}
      <p className="verification-disclaimer">{t("disclaimer")}</p>
    </section>
  );
}

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import bg from "../messages/bg.json";
import en from "../messages/en.json";
import type { CurrentUser } from "../types/user";
import VerificationStatusSummary from "./VerificationStatusSummary";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const values: Record<string, string> = {
      title: "Verification status",
      "labels.email": "Email",
      "labels.phone": "Phone",
      "labels.contact": "Contact policy",
      "labels.account": "Account",
      "labels.cleanerMarketplace": "Cleaner marketplace",
      "labels.full": "Full contact verification",
      "states.confirmed": "Confirmed",
      "states.incomplete": "Incomplete",
      "states.required": "Required",
      "states.planned": "Planned",
      "states.accessActive": "Marketplace access active",
      "states.accessLocked": "Marketplace access locked",
      interimPolicy:
        "Pilot marketplace access currently uses an interim email contact-confirmation policy.",
      disclaimer:
        "Email confirmation does not mean identity, references, an interview, or a trial job were checked.",
    };
    return values[key] ?? key;
  },
}));

const cleaner: CurrentUser = {
  id: 15,
  username: "cleaner@example.test",
  email: "cleaner@example.test",
  first_name: "Mila",
  last_name: "Cleaner",
  phone_number: "+359888000001",
  preferred_language: "en",
  role: "cleaner",
  account_status: "approved",
  is_approved: true,
  is_platform_admin: false,
  email_verified: true,
  phone_verified: false,
  contact_verified: true,
  fully_verified: false,
  marketplace_eligible: true,
  phone_verification_required: false,
};

describe("VerificationStatusSummary", () => {
  it("separates contact and marketplace states without implying identity checks", () => {
    render(
      <VerificationStatusSummary
        user={cleaner}
        cleanerMarketplaceStatus="verified"
      />,
    );

    expect(screen.getByText("Marketplace access active")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Contact policy")).toBeInTheDocument();
    expect(screen.getByText("Cleaner marketplace")).toBeInTheDocument();
    expect(screen.getByText("Full contact verification")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText(/interim email contact-confirmation policy/i)).toBeInTheDocument();
    expect(screen.getByText(/does not mean identity, references/i)).toBeInTheDocument();
    expect(screen.queryByText(/identity verified/i)).not.toBeInTheDocument();
  });

  it("shows locked access and a required phone state for the future policy", () => {
    render(
      <VerificationStatusSummary
        user={{
          ...cleaner,
          account_status: "pending",
          contact_verified: false,
          marketplace_eligible: false,
          phone_verification_required: true,
        }}
        cleanerMarketplaceStatus="pending"
      />,
    );

    expect(screen.getByText("Marketplace access locked")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByText(/interim email contact-confirmation policy/i)).not.toBeInTheDocument();
  });

  it("keeps the English and Bulgarian verification message contracts in sync", () => {
    expect(Object.keys(bg.verificationStatus)).toEqual(Object.keys(en.verificationStatus));
    expect(Object.keys(bg.verificationStatus.labels)).toEqual(
      Object.keys(en.verificationStatus.labels),
    );
    expect(Object.keys(bg.verificationStatus.states)).toEqual(
      Object.keys(en.verificationStatus.states),
    );
    expect(bg.verificationStatus.disclaimer).toMatch(/самоличност/i);
    expect(en.verificationStatus.disclaimer).toMatch(/identity/i);
  });
});

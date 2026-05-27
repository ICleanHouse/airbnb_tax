"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Home, Sparkles, UserPlus } from "lucide-react";
import { UserRole } from "../../../lib/api";

type SignupRole = Extract<UserRole, "host" | "cleaner" | "agency">;

const roles: Array<{
  value: SignupRole;
  label: string;
  description: string;
  icon: typeof Home;
}> = [
  {
    value: "host",
    label: "Host",
    description: "Post cleaning jobs for your properties.",
    icon: Home,
  },
  {
    value: "cleaner",
    label: "Cleaner",
    description: "Join the network and find cleaning jobs.",
    icon: Sparkles,
  },
  {
    value: "agency",
    label: "Agency",
    description: "Manage teams and assign cleaning jobs.",
    icon: Building2,
  },
];

export default function SignupRolePage() {
  const [selectedRole, setSelectedRole] = useState<SignupRole | null>(null);

  useEffect(() => {
    const rawDraft = sessionStorage.getItem("signup_draft");
    const emailVerificationToken = sessionStorage.getItem("signup_email_verification_token");
    if (!rawDraft || !emailVerificationToken) {
      window.location.href = "/signup";
      return;
    }
    const rawRole = sessionStorage.getItem("signup_role");
    if (rawRole === "host" || rawRole === "cleaner" || rawRole === "agency") {
      setSelectedRole(rawRole);
    }
  }, []);

  function continueToNextStep() {
    if (!selectedRole) return;
    sessionStorage.setItem("signup_role", selectedRole);
    window.location.href = "/signup/location";
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-role-step">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>

        <div className="signup-progress-wrap" aria-label="Signup progress">
          <div className="signup-progress-meta">
            <strong>Step 3 of 4</strong>
            <span>75% complete</span>
          </div>
          <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={75}>
            <div className="signup-progress-fill signup-progress-fill-step-3" />
          </div>
        </div>

        <div className="auth-heading">
          <h1>Choose account type</h1>
        </div>

        <div className="role-grid" role="radiogroup" aria-label="Account type">
          {roles.map((option) => {
            const Icon = option.icon;
            return (
              <button
                aria-checked={selectedRole === option.value}
                className={selectedRole === option.value ? "role-option selected" : "role-option"}
                key={option.value}
                onClick={() => setSelectedRole(option.value)}
                role="radio"
                type="button"
              >
                <Icon size={20} aria-hidden />
                <span>{option.label}</span>
                <small>{option.description}</small>
              </button>
            );
          })}
        </div>

        <button className="primary-link auth-submit" type="button" disabled={!selectedRole} onClick={continueToNextStep}>
          Continue
        </button>
      </section>
    </main>
  );
}

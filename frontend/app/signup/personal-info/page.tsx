"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { apiFetch } from "../../../lib/api";

const licenseCategories = ["AM", "A1", "A2", "A", "B1", "B", "BE", "C1", "C1E", "C", "CE", "D1", "D1E", "D", "DE", "Tкт", "Tтм"];
const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

type FieldErrors = Partial<Record<"birth_date" | "sex" | "has_driving_license" | "driving_license_categories" | "has_own_car" | "form", string>>;

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function adultCutoffDate() {
  const today = new Date();
  return new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
}

function isAdultBirthDate(value: string) {
  if (!value) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day) <= adultCutoffDate();
}

function formatBirthDate(value: string) {
  if (!value) return "Choose birth date";
  const [year, month, day] = value.split("-").map(Number);
  return `${pad2(day)} ${monthNames[month - 1]} ${year}`;
}

function monthOffset(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function readRequiredSession() {
  const rawDraft = sessionStorage.getItem("signup_draft");
  const role = sessionStorage.getItem("signup_role");
  const emailVerificationToken = sessionStorage.getItem("signup_email_verification_token");
  const city = sessionStorage.getItem("signup_city");
  const cityLabel = sessionStorage.getItem("signup_city_label");
  const rawZones = sessionStorage.getItem("signup_zones");
  if (!rawDraft || role !== "cleaner" || !emailVerificationToken || !city || !rawZones) return null;
  try {
    return {
      draft: JSON.parse(rawDraft) as Record<string, unknown>,
      emailVerificationToken,
      city: cityLabel ?? city,
      zones: JSON.parse(rawZones) as string[],
    };
  } catch {
    return null;
  }
}

export default function SignupPersonalInfoPage() {
  const cutoffDate = adultCutoffDate();
  const yearOptions = Array.from({ length: 83 }, (_, index) => cutoffDate.getFullYear() - index);
  const [birthDate, setBirthDate] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(cutoffDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(cutoffDate.getMonth());
  const [sex, setSex] = useState("");
  const [education, setEducation] = useState("");
  const [hasDrivingLicense, setHasDrivingLicense] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [hasOwnCar, setHasOwnCar] = useState("");
  const [smoker, setSmoker] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!readRequiredSession()) {
      window.location.href = "/signup";
    }
  }, []);

  function moveMonth(offset: number) {
    const next = new Date(calendarYear, calendarMonth + offset, 1);
    setCalendarYear(next.getFullYear());
    setCalendarMonth(next.getMonth());
  }

  function selectDay(day: number) {
    const selected = new Date(calendarYear, calendarMonth, day);
    const value = dateValue(selected);
    setBirthDate(value);
    setCalendarOpen(false);
    setErrors((prev) => ({ ...prev, birth_date: undefined }));
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, driving_license_categories: undefined }));
  }

  async function submitPersonalInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = readRequiredSession();
    if (!session) {
      window.location.href = "/signup";
      return;
    }

    const nextErrors: FieldErrors = {};
    if (!birthDate) {
      nextErrors.birth_date = "Birth date is required.";
    } else if (!isAdultBirthDate(birthDate)) {
      nextErrors.birth_date = "You must be at least 18 years old to sign up as a cleaner.";
    }
    if (!sex) nextErrors.sex = "Sex is required.";
    if (!hasDrivingLicense) nextErrors.has_driving_license = "Driving license answer is required.";
    if (hasDrivingLicense === "yes" && selectedCategories.size === 0) {
      nextErrors.driving_license_categories = "Choose at least one driving license category.";
    }
    if (!hasOwnCar) nextErrors.has_own_car = "Own car answer is required.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const response = await apiFetch("/api/accounts/signup/", {
        method: "POST",
        body: JSON.stringify({
          first_name: session.draft.first_name,
          last_name: session.draft.last_name,
          email: session.draft.email,
          password: session.draft.password,
          password_confirm: session.draft.password_confirm,
          role: "cleaner",
          email_verification_token: session.emailVerificationToken,
          city: session.city,
          service_areas: session.zones,
          birth_date: birthDate,
          sex,
          education,
          has_driving_license: hasDrivingLicense === "yes",
          driving_license_categories: Array.from(selectedCategories),
          has_own_car: hasOwnCar === "yes",
          smoker: smoker ? smoker === "yes" : null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrors({ form: typeof data.detail === "string" ? data.detail : "Could not create the account. Check your details and try again." });
        setSubmitting(false);
        return;
      }
      sessionStorage.removeItem("signup_draft");
      sessionStorage.removeItem("signup_email_verification_token");
      sessionStorage.removeItem("signup_role");
      sessionStorage.removeItem("signup_city");
      sessionStorage.removeItem("signup_city_label");
      sessionStorage.removeItem("signup_zones");
      window.location.href = "/app";
    } catch {
      setErrors({ form: "Could not create the account. Check your connection and try again." });
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-personal-step">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>

        <div className="signup-progress-wrap" aria-label="Signup progress">
          <div className="signup-progress-meta">
            <strong>Step 5 of 5</strong>
            <span>100% complete</span>
          </div>
          <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
            <div className="signup-progress-fill signup-progress-fill-step-4" />
          </div>
        </div>

        <div className="auth-heading">
          <h1>Personal information</h1>
        </div>

        <form className="auth-form signup-personal-form" onSubmit={submitPersonalInfo} noValidate>
          <div className="form-grid">
            <div className="signup-birthdate-field">
              <span>Date of birth</span>
              <div className={errors.birth_date ? "birthdate-picker input-invalid" : "birthdate-picker"}>
                <button type="button" className="birthdate-selected" onClick={() => setCalendarOpen((open) => !open)}>
                  <CalendarDays size={18} aria-hidden />
                  <strong>{formatBirthDate(birthDate)}</strong>
                </button>
                {calendarOpen ? (
                  <div className="birthdate-calendar">
                    <div className="birthdate-calendar-head">
                      <div className="birthdate-month-selectors">
                        <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))} aria-label="Birth month">
                          {monthNames.map((month, index) => (
                            <option key={month} value={index}>{month}</option>
                          ))}
                        </select>
                        <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))} aria-label="Birth year">
                          {yearOptions.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                      <div className="birthdate-month-arrows">
                        <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
                          <ChevronLeft size={22} aria-hidden />
                        </button>
                        <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
                          <ChevronRight size={22} aria-hidden />
                        </button>
                      </div>
                    </div>
                    <div className="birthdate-weekdays">
                      {weekdayLabels.map((weekday, index) => (
                        <span key={`${weekday}-${index}`}>{weekday}</span>
                      ))}
                    </div>
                    <div className="birthdate-days">
                      {Array.from({ length: monthOffset(calendarYear, calendarMonth) }, (_, index) => (
                        <span className="birthdate-empty-day" key={`empty-${index}`} />
                      ))}
                      {Array.from({ length: daysInMonth(calendarYear, calendarMonth) }, (_, index) => {
                        const day = index + 1;
                        const value = dateValue(new Date(calendarYear, calendarMonth, day));
                        const disabled = !isAdultBirthDate(value);
                        return (
                          <button
                            type="button"
                            key={value}
                            className={birthDate === value ? "birthdate-day selected" : "birthdate-day"}
                            onClick={() => selectDay(day)}
                            disabled={disabled}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              {errors.birth_date ? <small className="field-error-text">{errors.birth_date}</small> : null}
            </div>

            <label>
              <span>Sex</span>
              <select
                value={sex}
                onChange={(event) => {
                  setSex(event.target.value);
                  setErrors((prev) => ({ ...prev, sex: undefined }));
                }}
                className={errors.sex ? "input-invalid" : ""}
                required
              >
                <option value="">Choose</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
              {errors.sex ? <small className="field-error-text">{errors.sex}</small> : null}
            </label>

            <label>
              <span>Education</span>
              <select value={education} onChange={(event) => setEducation(event.target.value)}>
                <option value="">Choose</option>
                <option value="none">No education</option>
                <option value="primary">Primary education</option>
                <option value="high_school">High school</option>
                <option value="higher">Higher education</option>
              </select>
            </label>

            <label>
              <span>Own car</span>
              <select
                value={hasOwnCar}
                onChange={(event) => {
                  setHasOwnCar(event.target.value);
                  setErrors((prev) => ({ ...prev, has_own_car: undefined }));
                }}
                className={errors.has_own_car ? "input-invalid" : ""}
                required
              >
                <option value="">Choose</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {errors.has_own_car ? <small className="field-error-text">{errors.has_own_car}</small> : null}
            </label>

            <label>
              <span>Smoker</span>
              <select value={smoker} onChange={(event) => setSmoker(event.target.value)}>
                <option value="">Choose</option>
                <option value="yes">Smoker</option>
                <option value="no">Non-smoker</option>
              </select>
            </label>

            <div className="signup-driving-license-field">
              <label>
                <span>Driving license</span>
                <select
                  value={hasDrivingLicense}
                  onChange={(event) => {
                    setHasDrivingLicense(event.target.value);
                    if (event.target.value === "no") setSelectedCategories(new Set());
                    setErrors((prev) => ({ ...prev, has_driving_license: undefined, driving_license_categories: undefined }));
                  }}
                  className={errors.has_driving_license ? "input-invalid" : ""}
                  required
                >
                  <option value="">Choose</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                {errors.has_driving_license ? <small className="field-error-text">{errors.has_driving_license}</small> : null}
              </label>

              {hasDrivingLicense === "yes" ? (
                <section className="license-category-panel" aria-label="Driving license categories">
                  <strong>Driving license categories</strong>
                  <div className="license-category-grid">
                    {licenseCategories.map((category) => (
                      <button
                        type="button"
                        key={category}
                        className={selectedCategories.has(category) ? "license-category selected" : "license-category"}
                        onClick={() => toggleCategory(category)}
                        aria-pressed={selectedCategories.has(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  {errors.driving_license_categories ? <small className="field-error-text">{errors.driving_license_categories}</small> : null}
                </section>
              ) : null}
            </div>
          </div>

          {errors.form ? <p className="form-error">{errors.form}</p> : null}
          <button className="primary-link auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Creating account" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

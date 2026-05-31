"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Apple,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  MailCheck,
  RotateCw,
  Sparkles,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { apiFetch, UserRole } from "../../lib/api";
import { cities } from "../../lib/cityDistricts";

type SignupRole = Extract<UserRole, "host" | "cleaner" | "agency">;
type SignupStep = "account" | "confirm_email" | "role" | "location" | "personal_info" | "native_language" | "experience" | "availability" | "introduction";
type SignupField = "first_name" | "last_name" | "email" | "password" | "password_confirm" | "form";
type SignupFieldErrors = Partial<Record<SignupField, string>>;
type PersonalInfoErrors = Partial<Record<"birth_date" | "sex", string>>;
type Direction = 1 | -1;
type WeeklyTimeSlot = "morning" | "afternoon" | "evening";
type JobTypePreference = "one_off" | "ongoing" | "both";
type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type WeeklyAvailability = Partial<Record<Weekday, WeeklyTimeSlot[]>>;

type SignupDraft = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirm: string;
};

const roles: Array<{ value: SignupRole; label: string; description: string; icon: typeof Home }> = [
  { value: "host", label: "Host", description: "Post cleaning jobs for your properties.", icon: Home },
  { value: "cleaner", label: "Cleaner", description: "Join the network and find cleaning jobs.", icon: Sparkles },
  { value: "agency", label: "Agency", description: "Manage teams and assign cleaning jobs.", icon: Building2 },
];

const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
const sexOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
const primaryLanguageOptions = [
  { value: "Български", label: "Български" },
  { value: "Русский", label: "Русский" },
  { value: "English", label: "English" },
  { value: "Română", label: "Română" },
  { value: "Српски", label: "Српски" },
  { value: "Ελληνικά", label: "Ελληνικά" },
  { value: "other", label: "Other" },
];
const otherLanguageOptions = [
  "Українська",
  "Македонски",
  "Bosanski",
  "Hrvatski",
  "Slovenščina",
  "Shqip",
  "Español",
  "Français",
  "Deutsch",
  "Italiano",
  "Português",
  "Nederlands",
  "Polski",
  "Čeština",
  "Slovenčina",
  "Magyar",
  "Türkçe",
  "العربية",
  "עברית",
  "فارسی",
  "Հայերեն",
  "ქართული",
  "中文",
  "日本語",
  "한국어",
  "हिन्दी",
  "বাংলা",
  "ภาษาไทย",
  "Tiếng Việt",
  "Bahasa Indonesia",
  "Bahasa Melayu",
  "Kiswahili",
];
const experienceOptions = [
  { value: "none", label: "I don't have experience" },
  { value: "1_year", label: "1 year" },
  { value: "2_years", label: "2 years" },
  { value: "3_years", label: "3 years" },
  { value: "4_years", label: "4 years" },
  { value: "5_years", label: "5 years" },
  { value: "more_than_5_years", label: "More than 5 years of experience" },
];
const weeklyDayOptions: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const weeklyTimeOptions: Array<{ value: WeeklyTimeSlot; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const jobTypePreferenceOptions: Array<{ value: JobTypePreference; label: string }> = [
  { value: "one_off", label: "One-off jobs" },
  { value: "ongoing", label: "Ongoing work" },
  { value: "both", label: "Open to both" },
];
const introductionMaxLength = 1500;
function validateEmailAddress(rawEmail: string): string | null {
  const email = rawEmail.trim();
  if (!email) return "Email is required.";
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex !== email.indexOf("@") || atIndex === email.length - 1) return "Enter a valid email address.";
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1).toLowerCase();
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..") || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return "Enter a valid email address.";
  }
  const labels = domainPart.split(".");
  if (labels.length < 2) return "Email domain must include a valid ending (for example .com or .bg).";
  for (const label of labels) {
    if (!label) return "Invalid email domain.";
    if (label.startsWith("-") || label.endsWith("-")) return "Email domain labels cannot start or end with a hyphen.";
    if (!/^[a-z0-9-]+$/.test(label)) return "Email domain labels can only use letters, numbers, and hyphens.";
  }
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return "Email ending is not valid.";
  return null;
}

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

function isValidDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function monthOffset(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function asSet(value: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function normalizeWeeklyAvailability(value: unknown): WeeklyAvailability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const allowedSlots = new Set(weeklyTimeOptions.map((option) => option.value));
  const normalized: WeeklyAvailability = {};
  for (const day of weeklyDayOptions) {
    const slots = raw[day.value];
    if (!Array.isArray(slots)) continue;
    const validSlots = slots.filter((slot): slot is WeeklyTimeSlot => typeof slot === "string" && allowedSlots.has(slot as WeeklyTimeSlot));
    if (validSlots.length > 0) normalized[day.value] = Array.from(new Set(validSlots));
  }
  return normalized;
}

function weeklyAvailabilitySlotCount(value: WeeklyAvailability) {
  return Object.values(value).reduce((total, slots) => total + (slots?.length ?? 0), 0);
}

function derivePreferredTimeSlots(value: WeeklyAvailability): WeeklyTimeSlot[] {
  const selected = new Set(Object.values(value).flatMap((slots) => slots ?? []));
  return weeklyTimeOptions.map((option) => option.value).filter((slot) => selected.has(slot));
}

function stepIndex(step: SignupStep, role: SignupRole | null) {
  const steps = role === "cleaner"
    ? ["role", "personal_info", "location", "native_language", "experience", "availability", "introduction"]
    : ["role", "location"];
  return Math.max(0, steps.indexOf(step));
}

function hasProgress(step: SignupStep) {
  return step !== "account" && step !== "confirm_email";
}

export default function SignupPage() {
  const prefersReducedMotion = useReducedMotion();
  const cutoffDate = adultCutoffDate();
  const yearOptions = Array.from({ length: 83 }, (_, index) => cutoffDate.getFullYear() - index);
  const minBirthDate = `${yearOptions[yearOptions.length - 1]}-01-01`;
  const maxBirthDate = dateValue(cutoffDate);

  const [step, setStep] = useState<SignupStep>("account");
  const [direction, setDirection] = useState<Direction>(1);
  const [restored, setRestored] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailVerificationToken, setEmailVerificationToken] = useState("");
  const [role, setRole] = useState<SignupRole | null>(null);
  const [city, setCity] = useState("");
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [languageChoice, setLanguageChoice] = useState("");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [experience, setExperience] = useState("");
  const [jobTypePreference, setJobTypePreference] = useState<JobTypePreference | "">("");
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailability>({});
  const [introduction, setIntroduction] = useState("");

  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [personalErrors, setPersonalErrors] = useState<PersonalInfoErrors>({});
  const [languageError, setLanguageError] = useState("");
  const [experienceError, setExperienceError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [introductionError, setIntroductionError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const [availableChoice, setAvailableChoice] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [draggedZone, setDraggedZone] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<"available" | "selected" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(cutoffDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(cutoffDate.getMonth());
  const [otherDropdownOpen, setOtherDropdownOpen] = useState(false);
  const [showEmptyBioPrompt, setShowEmptyBioPrompt] = useState(false);
  const [introductionFocused, setIntroductionFocused] = useState(false);
  const introductionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("signup_wizard_state");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<{
          step: SignupStep;
          firstName: string;
          lastName: string;
          email: string;
          password: string;
          confirmPassword: string;
          emailVerificationToken: string;
          role: SignupRole;
          city: string;
          selectedZones: string[];
          birthDate: string;
          sex: string;
          nativeLanguage: string;
          experience: string;
          jobTypePreference: JobTypePreference;
          weeklyAvailability: WeeklyAvailability;
          introduction: string;
        }>;
        setStep(parsed.step ?? "account");
        setFirstName(parsed.firstName ?? "");
        setLastName(parsed.lastName ?? "");
        setEmail(parsed.email ?? "");
        setPassword(parsed.password ?? "");
        setConfirmPassword(parsed.confirmPassword ?? "");
        setEmailVerificationToken(parsed.emailVerificationToken ?? "");
        if (parsed.role === "host" || parsed.role === "cleaner" || parsed.role === "agency") setRole(parsed.role);
        setCity(parsed.city ?? "");
        setSelectedZones(new Set(parsed.selectedZones ?? []));
        setBirthDate(parsed.birthDate ?? "");
        setSex(parsed.sex ?? "");
        if (parsed.nativeLanguage) {
          const primary = primaryLanguageOptions.find((option) => option.value === parsed.nativeLanguage);
          if (primary) setLanguageChoice(primary.value);
          else {
            setLanguageChoice("other");
            setOtherLanguage(parsed.nativeLanguage);
          }
        }
        setExperience(parsed.experience ?? "");
        if (parsed.jobTypePreference === "one_off" || parsed.jobTypePreference === "ongoing" || parsed.jobTypePreference === "both") setJobTypePreference(parsed.jobTypePreference);
        setWeeklyAvailability(normalizeWeeklyAvailability(parsed.weeklyAvailability));
        setIntroduction(parsed.introduction ?? "");
      } catch {
        setStep("account");
      }
    } else {
      const rawDraft = sessionStorage.getItem("signup_draft");
      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft) as Partial<SignupDraft>;
          setFirstName(draft.first_name ?? "");
          setLastName(draft.last_name ?? "");
          setEmail(draft.email ?? "");
          setPassword(draft.password ?? "");
          setConfirmPassword(draft.password_confirm ?? "");
        } catch {
          // Ignore legacy malformed drafts.
        }
      }
      setEmailVerificationToken(sessionStorage.getItem("signup_email_verification_token") ?? "");
      const storedRole = sessionStorage.getItem("signup_role");
      if (storedRole === "host" || storedRole === "cleaner" || storedRole === "agency") setRole(storedRole);
      setCity(sessionStorage.getItem("signup_city") ?? "");
      setSelectedZones(asSet(sessionStorage.getItem("signup_zones")));
      setBirthDate(sessionStorage.getItem("signup_birth_date") ?? "");
      setSex(sessionStorage.getItem("signup_sex") ?? "");
      const nativeLanguage = sessionStorage.getItem("signup_native_language") ?? "";
      if (nativeLanguage) {
        const primary = primaryLanguageOptions.find((option) => option.value === nativeLanguage);
        if (primary) setLanguageChoice(primary.value);
        else {
          setLanguageChoice("other");
          setOtherLanguage(nativeLanguage);
        }
      }
      setExperience(sessionStorage.getItem("signup_experience_level") ?? "");
      const storedJobTypePreference = sessionStorage.getItem("signup_job_type_preference");
      if (storedJobTypePreference === "one_off" || storedJobTypePreference === "ongoing" || storedJobTypePreference === "both") setJobTypePreference(storedJobTypePreference);
      setIntroduction(sessionStorage.getItem("signup_introduction") ?? "");
      const storedWeeklyAvailability = sessionStorage.getItem("signup_weekly_availability");
      if (storedWeeklyAvailability) {
        try {
          setWeeklyAvailability(normalizeWeeklyAvailability(JSON.parse(storedWeeklyAvailability) as unknown));
        } catch {
          setWeeklyAvailability({});
        }
      }
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const nativeLanguage = languageChoice === "other" ? otherLanguage : languageChoice;
    sessionStorage.setItem(
      "signup_wizard_state",
      JSON.stringify({
        step,
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
        emailVerificationToken,
        role,
        city,
        selectedZones: Array.from(selectedZones),
        birthDate,
        sex,
        nativeLanguage,
        experience,
        jobTypePreference,
        weeklyAvailability,
        introduction,
      }),
    );
    if (firstName || lastName || email || password || confirmPassword) {
      sessionStorage.setItem(
        "signup_draft",
        JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          password_confirm: confirmPassword,
        }),
      );
    }
    if (emailVerificationToken) sessionStorage.setItem("signup_email_verification_token", emailVerificationToken);
    if (role) sessionStorage.setItem("signup_role", role);
    if (city) {
      const selectedCity = cities.find((item) => item.value === city);
      sessionStorage.setItem("signup_city", city);
      sessionStorage.setItem("signup_city_label", selectedCity?.label ?? city);
    }
    sessionStorage.setItem("signup_zones", JSON.stringify(Array.from(selectedZones)));
    if (birthDate) sessionStorage.setItem("signup_birth_date", birthDate);
    if (sex) sessionStorage.setItem("signup_sex", sex);
    if (nativeLanguage) sessionStorage.setItem("signup_native_language", nativeLanguage);
    if (experience) sessionStorage.setItem("signup_experience_level", experience);
    if (jobTypePreference) sessionStorage.setItem("signup_job_type_preference", jobTypePreference);
    sessionStorage.setItem("signup_weekly_availability", JSON.stringify(weeklyAvailability));
    sessionStorage.setItem("signup_introduction", introduction);
  }, [birthDate, city, confirmPassword, email, emailVerificationToken, experience, firstName, introduction, jobTypePreference, languageChoice, lastName, otherLanguage, password, restored, role, selectedZones, sex, step, weeklyAvailability]);

  useEffect(() => {
    const input = introductionInputRef.current;
    if (!input || step !== "introduction") return;
    input.style.height = "auto";
    input.style.height = `${Math.max(200, input.scrollHeight)}px`;
  }, [introduction, step]);

  const selectedCity = useMemo(() => cities.find((item) => item.value === city) ?? null, [city]);
  const availableZones = useMemo(() => selectedCity?.zones.filter((zone) => !selectedZones.has(zone)) ?? [], [selectedCity, selectedZones]);
  const selectedZoneList = useMemo(() => selectedCity?.zones.filter((zone) => selectedZones.has(zone)) ?? [], [selectedCity, selectedZones]);
  const filteredAvailableZones = useMemo(() => {
    const query = districtSearch.trim().toLocaleLowerCase();
    if (!query) return availableZones;
    return availableZones.filter((zone) => zone.toLocaleLowerCase().includes(query));
  }, [availableZones, districtSearch]);
  const canContinueLocation = Boolean(selectedCity && selectedZones.size > 0);
  const totalSteps = role === "cleaner" ? 7 : 2;
  const progressPercent = Math.round(((stepIndex(step, role) + 1) / totalSteps) * 100);

  function selectedNativeLanguage() {
    if (languageChoice === "other") return otherLanguage;
    return languageChoice;
  }

  function draft(): SignupDraft {
    return {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      password,
      password_confirm: confirmPassword,
    };
  }

  function clearFieldError(field: SignupField) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function goTo(nextStep: SignupStep, nextDirection: Direction) {
    setDirection(nextDirection);
    setSubmitError("");
    setShowEmptyBioPrompt(false);
    setStep(nextStep);
  }

  function clearSignupStorage() {
    [
      "signup_wizard_state",
      "signup_draft",
      "signup_email_verification_token",
      "signup_role",
      "signup_city",
      "signup_city_label",
      "signup_zones",
      "signup_birth_date",
      "signup_sex",
      "signup_native_language",
      "signup_experience_level",
      "signup_job_type_preference",
      "signup_work_preference",
      "signup_preferred_time_slots",
      "signup_introduction",
      "signup_weekly_availability",
      "signup_customize_availability",
    ].forEach((key) => sessionStorage.removeItem(key));
  }

  async function createAccount(payload: Record<string, unknown>) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await apiFetch("/api/accounts/signup/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setSubmitError(typeof data.detail === "string" ? data.detail : "Could not create the account. Check your details and try again.");
        setSubmitting(false);
        return;
      }
      clearSignupStorage();
      window.location.href = "/app";
    } catch {
      setSubmitError("Could not create the account. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: SignupFieldErrors = {};
    if (!firstName.trim()) nextErrors.first_name = "First name is required.";
    if (!lastName.trim()) nextErrors.last_name = "Last name is required.";
    const emailError = validateEmailAddress(email);
    if (emailError) nextErrors.email = emailError;
    const hasPasswordRules = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
    if (!hasPasswordRules) nextErrors.password = "Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, a number, and a special character.";
    if (password !== confirmPassword) nextErrors.password_confirm = "Passwords do not match.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const payload = draft();
      const response = await apiFetch("/api/accounts/signup/email-code/", {
        method: "POST",
        body: JSON.stringify({
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const nextErrors: SignupFieldErrors = {};
        if (Array.isArray(data.email)) nextErrors.email = data.email[0];
        else if (typeof data.email === "string") nextErrors.email = data.email;
        else if (typeof data.detail === "string") nextErrors.form = data.detail;
        else nextErrors.form = "Could not send the confirmation code. Try again.";
        setFieldErrors(nextErrors);
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      goTo("confirm_email", 1);
    } catch {
      setFieldErrors({ form: "Could not send the confirmation code. Check your connection and try again." });
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setCodeError("Enter the 6-digit code.");
      return;
    }
    setSubmitting(true);
    setCodeError("");
    setCodeNotice("");
    try {
      const response = await apiFetch("/api/accounts/signup/verify-email-code/", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code: normalizedCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const nextCodeError = Array.isArray(data.code) ? data.code[0] : data.code;
        setCodeError(typeof nextCodeError === "string" ? nextCodeError : "The confirmation code is incorrect.");
        setSubmitting(false);
        return;
      }
      if (typeof data.email_verification_token !== "string") {
        setCodeError("Could not verify this email. Request a new code and try again.");
        setSubmitting(false);
        return;
      }
      setEmailVerificationToken(data.email_verification_token);
      setSubmitting(false);
      goTo("role", 1);
    } catch {
      setCodeError("Could not verify the code. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (resending) return;
    setResending(true);
    setCodeError("");
    setCodeNotice("");
    try {
      const payload = draft();
      const response = await apiFetch("/api/accounts/signup/email-code/", {
        method: "POST",
        body: JSON.stringify({
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email,
        }),
      });
      if (!response.ok) {
        setCodeError("Could not send a new code. Try again.");
        setResending(false);
        return;
      }
      setCodeNotice("A new confirmation code was sent.");
      setResending(false);
    } catch {
      setCodeError("Could not send a new code. Check your connection and try again.");
      setResending(false);
    }
  }

  function continueFromRole() {
    if (!role || !emailVerificationToken) return;
    goTo(role === "cleaner" ? "personal_info" : "location", 1);
  }

  function addNeighborhood() {
    if (!selectedCity || !availableChoice) return;
    setSelectedZones((prev) => new Set(prev).add(availableChoice));
    setAvailableChoice("");
  }

  function removeNeighborhood() {
    if (!selectedChoice) return;
    setSelectedZones((prev) => {
      const next = new Set(prev);
      next.delete(selectedChoice);
      return next;
    });
    setSelectedChoice("");
  }

  function selectAllZones() {
    if (selectedCity) setSelectedZones(new Set(selectedCity.zones));
  }

  function clearZones() {
    setSelectedZones(new Set());
  }

  function addSpecificNeighborhood(zone: string) {
    if (!selectedCity) return;
    setSelectedZones((prev) => new Set(prev).add(zone));
    setAvailableChoice("");
  }

  function removeSpecificNeighborhood(zone: string) {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      next.delete(zone);
      return next;
    });
    setSelectedChoice("");
  }

  function handleDropToSelected() {
    if (dragSource !== "available" || !draggedZone) return;
    addSpecificNeighborhood(draggedZone);
    setDraggedZone(null);
    setDragSource(null);
  }

  function handleDropToAvailable() {
    if (dragSource !== "selected" || !draggedZone) return;
    removeSpecificNeighborhood(draggedZone);
    setDraggedZone(null);
    setDragSource(null);
  }

  function continueFromLocation() {
    if (!canContinueLocation || !selectedCity || !role || !emailVerificationToken) return;
    if (role === "cleaner") {
      goTo("native_language", 1);
      return;
    }
    void createAccount({
      ...draft(),
      role,
      email_verification_token: emailVerificationToken,
      city: selectedCity.label,
      service_areas: Array.from(selectedZones),
    });
  }

  function moveMonth(offset: number) {
    const next = new Date(calendarYear, calendarMonth + offset, 1);
    setCalendarYear(next.getFullYear());
    setCalendarMonth(next.getMonth());
  }

  function selectDay(day: number) {
    const selected = new Date(calendarYear, calendarMonth, day);
    setBirthDate(dateValue(selected));
    setCalendarOpen(false);
    setPersonalErrors((prev) => ({ ...prev, birth_date: undefined }));
  }

  function changeBirthDate(value: string) {
    setBirthDate(value);
    if (isValidDateValue(value)) {
      const [year, month] = value.split("-").map(Number);
      setCalendarYear(year);
      setCalendarMonth(month - 1);
      setPersonalErrors((prev) => ({ ...prev, birth_date: undefined }));
    }
  }

  function submitPersonalInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: PersonalInfoErrors = {};
    if (!birthDate) nextErrors.birth_date = "Birth date is required.";
    else if (!isValidDateValue(birthDate)) nextErrors.birth_date = "Enter a valid birth date.";
    else if (!isAdultBirthDate(birthDate)) nextErrors.birth_date = "You must be at least 18 years old to sign up as a cleaner.";
    if (!sex) nextErrors.sex = "Sex is required.";
    if (Object.keys(nextErrors).length > 0) {
      setPersonalErrors(nextErrors);
      return;
    }
    goTo("location", 1);
  }

  function continueFromLanguage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNativeLanguage()) {
      setLanguageError(languageChoice === "other" ? "Choose a language from the dropdown." : "Choose your native language.");
      return;
    }
    goTo("experience", 1);
  }

  function submitExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (!experience) {
      setExperienceError("Choose your experience level.");
      return;
    }
    goTo("availability", 1);
  }

  function toggleWeeklyAvailabilitySlot(day: Weekday, slot: WeeklyTimeSlot) {
    setAvailabilityError("");
    setWeeklyAvailability((current) => {
      const currentSlots = current[day] ?? [];
      const nextSlots = currentSlots.includes(slot)
        ? currentSlots.filter((item) => item !== slot)
        : [...currentSlots, slot];
      const next = { ...current };
      if (nextSlots.length > 0) next[day] = nextSlots;
      else delete next[day];
      return next;
    });
  }

  function changeIntroduction(value: string) {
    setIntroduction(value.slice(0, introductionMaxLength));
    setIntroductionError("");
    setShowEmptyBioPrompt(false);
  }

  function submitAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (!jobTypePreference) {
      setAvailabilityError("Choose whether you prefer one-off jobs, ongoing work, or both.");
      return;
    }
    if (weeklyAvailabilitySlotCount(weeklyAvailability) === 0) {
      setAvailabilityError("Choose at least one day and time when you are available.");
      return;
    }
    goTo("introduction", 1);
  }

  function createCleanerAccount() {
    if (!selectedCity) return;
    void createAccount({
      ...draft(),
      role: "cleaner",
      email_verification_token: emailVerificationToken,
      city: selectedCity.label,
      service_areas: Array.from(selectedZones),
      birth_date: birthDate,
      sex,
      native_language: selectedNativeLanguage(),
      experience_level: experience,
      job_type_preference: jobTypePreference,
      preferred_time_slots: derivePreferredTimeSlots(weeklyAvailability),
      weekly_availability: weeklyAvailability,
      bio: introduction.trim(),
    });
  }

  function submitIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (introduction.length > introductionMaxLength) {
      setIntroductionError(`Keep your introduction under ${introductionMaxLength} characters.`);
      return;
    }
    if (!introduction.trim()) {
      setSubmitError("");
      setIntroductionError("");
      setShowEmptyBioPrompt(true);
      return;
    }
    createCleanerAccount();
  }

  function returnToIntroduction() {
    setShowEmptyBioPrompt(false);
    window.requestAnimationFrame(() => {
      introductionInputRef.current?.focus();
    });
  }

  function createAccountWithoutBio() {
    setShowEmptyBioPrompt(false);
    createCleanerAccount();
  }

  const passwordChecks = [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "At least one uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", passed: /[a-z]/.test(password) },
    { label: "At least one number", passed: /\d/.test(password) },
    { label: "At least one special character", passed: /[^A-Za-z0-9]/.test(password) },
  ];

  function renderStep() {
    if (step === "account") {
      return (
        <>
          <div className="auth-heading">
            <h1>Create account</h1>
          </div>
          <div className="login-choice-actions signup-social-block" aria-label="Social sign up">
            <button className="auth-choice-button social-auth-btn" type="button">
              <span className="social-google-g" aria-hidden>G</span>
              <span>Google</span>
            </button>
            <button className="auth-choice-button social-auth-btn" type="button">
              <Apple size={24} aria-hidden />
              <span>Apple</span>
            </button>
          </div>
          <form className="auth-form" onSubmit={submitAccount} noValidate>
            <div className="form-grid signup-form-grid">
              <label>
                <span>First name</span>
                <input autoComplete="given-name" aria-invalid={Boolean(fieldErrors.first_name)} className={fieldErrors.first_name ? "input-invalid" : ""} required value={firstName} onChange={(event) => { setFirstName(event.target.value); clearFieldError("first_name"); }} />
                {fieldErrors.first_name ? <small className="field-error-text">{fieldErrors.first_name}</small> : null}
              </label>
              <label>
                <span>Last name</span>
                <input autoComplete="family-name" aria-invalid={Boolean(fieldErrors.last_name)} className={fieldErrors.last_name ? "input-invalid" : ""} required value={lastName} onChange={(event) => { setLastName(event.target.value); clearFieldError("last_name"); }} />
                {fieldErrors.last_name ? <small className="field-error-text">{fieldErrors.last_name}</small> : null}
              </label>
              <label>
                <span>Email</span>
                <input autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} className={fieldErrors.email ? "input-invalid" : ""} required type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); }} />
                {fieldErrors.email ? <small className="field-error-text">{fieldErrors.email}</small> : null}
              </label>
              <label>
                <span>Password</span>
                <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} className={fieldErrors.password ? "input-invalid" : ""} minLength={8} required type="password" value={password} onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }} placeholder="At least 8 characters" />
                {fieldErrors.password ? <small className="field-error-text">{fieldErrors.password}</small> : null}
                {password.length > 0 ? (
                  <ul className="password-checklist" aria-live="polite">
                    {passwordChecks.map((rule) => (
                      <li key={rule.label} className={rule.passed ? "password-check-item passed" : "password-check-item failed"}>
                        <span className="password-check-icon" aria-hidden>{rule.passed ? "✓" : "✕"}</span>
                        <span>{rule.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <label>
                <span>Confirm password</span>
                <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password_confirm)} className={fieldErrors.password_confirm ? "input-invalid" : ""} minLength={8} required type="password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); clearFieldError("password_confirm"); }} />
                {fieldErrors.password_confirm ? <small className="field-error-text">{fieldErrors.password_confirm}</small> : null}
              </label>
            </div>
            {fieldErrors.form ? <p className="form-error">{fieldErrors.form}</p> : null}
            {submitting ? (
              <div className="signup-loading-status" role="status" aria-live="polite">
                <span className="signup-loading-spinner" aria-hidden />
                <span>Sending confirmation code...</span>
              </div>
            ) : null}
            <button className="primary-link auth-submit" type="submit" disabled={submitting}>
              <UserRoundCheck size={18} aria-hidden />
              {submitting ? "Sending code" : "Create account"}
            </button>
          </form>
          <p className="auth-switch">Already registered? <Link href="/login">Log in</Link></p>
        </>
      );
    }

    if (step === "confirm_email") {
      return (
        <>
          <div className="auth-heading">
            <h1>Confirm your email</h1>
            <p>Enter the 6-digit code sent to <strong>{email || "your email"}</strong>.</p>
          </div>
          <form className="auth-form signup-code-form" onSubmit={verifyCode} noValidate>
            <label className="signup-code-label">
              <span>Confirmation code</span>
              <div className={codeError ? "signup-code-boxes input-invalid" : "signup-code-boxes"} onClick={() => document.getElementById("signup-code-input")?.focus()}>
                {Array.from({ length: 6 }, (_, index) => (
                  <span className={code[index] ? "signup-code-box filled" : "signup-code-box"} key={index}>{code[index] ?? ""}</span>
                ))}
                <input id="signup-code-input" className="signup-code-input" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }} autoComplete="one-time-code" aria-label="Confirmation code" aria-invalid={Boolean(codeError)} />
              </div>
              {codeError ? <small className="field-error-text">{codeError}</small> : null}
              {codeNotice ? <small className="signup-code-notice">{codeNotice}</small> : null}
            </label>
            <div className="signup-nav-actions signup-nav-actions--confirm">
              <button className="secondary-link signup-resend-button" type="button" onClick={resendCode} disabled={resending}>
                <RotateCw size={17} aria-hidden />
                {resending ? "Sending" : "Resend code"}
              </button>
              <button className="primary-link auth-submit" type="submit" disabled={submitting || code.length !== 6}>
                <MailCheck size={18} aria-hidden />
                {submitting ? "Checking code" : "Confirm email"}
              </button>
            </div>
          </form>
        </>
      );
    }

    if (step === "role") {
      return (
        <>
          <div className="auth-heading">
            <h1>Choose account type</h1>
          </div>
          <div className="role-grid" role="radiogroup" aria-label="Account type">
            {roles.map((option) => {
              const Icon = option.icon;
              return (
                <button aria-checked={role === option.value} className={role === option.value ? "role-option selected" : "role-option"} key={option.value} onClick={() => setRole(option.value)} role="radio" type="button">
                  <Icon size={20} aria-hidden />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              );
            })}
          </div>
          <div className="signup-nav-actions">
            <button type="button" className="secondary-link" onClick={() => goTo("confirm_email", -1)}>
              <ChevronLeft size={16} aria-hidden />
              Back
            </button>
            <button className="primary-link auth-submit" type="button" disabled={!role} onClick={continueFromRole}>
              Continue
            </button>
          </div>
        </>
      );
    }

    if (step === "location") {
      return (
        <>
          <div className="auth-heading">
            <h1>Select your city and area</h1>
          </div>
          <label className="signup-city-picker">
            <span>City</span>
            <select value={city} onChange={(event) => { setCity(event.target.value); setSelectedZones(new Set()); setAvailableChoice(""); setSelectedChoice(""); setDistrictSearch(""); }}>
              <option value="">Choose city</option>
              {cities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {selectedCity ? (
            <section className="zones-panel" aria-label={`${selectedCity.label} neighborhoods`}>
              <header className="zones-panel-head">
                <strong>Area selection</strong>
                <div className="zones-actions">
                  <button type="button" onClick={selectAllZones}>Select all</button>
                  <button type="button" onClick={clearZones}>Clear all</button>
                </div>
              </header>
              <div className="dual-zone-transfer">
                <label className="dual-zone-list">
                  <span>List of Districts:</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label="List of Districts" onDragOver={(event) => event.preventDefault()} onDrop={handleDropToAvailable}>
                    <div className="dual-zone-listbox-search-wrap">
                      <input className="dual-zone-search" type="text" placeholder="Search district" value={districtSearch} onChange={(event) => setDistrictSearch(event.target.value)} />
                    </div>
                    <div className="dual-zone-items">
                      {filteredAvailableZones.map((zone) => (
                        <button type="button" key={zone} className={availableChoice === zone ? "dual-zone-item selected" : "dual-zone-item"} onClick={() => setAvailableChoice(zone)} onDoubleClick={() => addSpecificNeighborhood(zone)} draggable onDragStart={() => { setDraggedZone(zone); setDragSource("available"); }} onDragEnd={() => { setDraggedZone(null); setDragSource(null); }}>
                          {zone}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
                <div className="dual-zone-controls">
                  <button type="button" onClick={addNeighborhood} disabled={!availableChoice} aria-label="Add neighborhood">▶</button>
                  <button type="button" onClick={removeNeighborhood} disabled={!selectedChoice} aria-label="Remove neighborhood">◀</button>
                </div>
                <label className="dual-zone-list">
                  <span>Selected Districts:</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label="Selected Districts" onDragOver={(event) => event.preventDefault()} onDrop={handleDropToSelected}>
                    <div className="dual-zone-items">
                      {selectedZoneList.map((zone) => (
                        <button type="button" key={zone} className={selectedChoice === zone ? "dual-zone-item selected" : "dual-zone-item"} onClick={() => setSelectedChoice(zone)} onDoubleClick={() => removeSpecificNeighborhood(zone)} draggable onDragStart={() => { setDraggedZone(zone); setDragSource("selected"); }} onDragEnd={() => { setDraggedZone(null); setDragSource(null); }}>
                          {zone}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
              </div>
            </section>
          ) : null}
          {submitError ? <p className="form-error">{submitError}</p> : null}
          <div className="signup-nav-actions">
            <button type="button" className="secondary-link" onClick={() => goTo(role === "cleaner" ? "personal_info" : "role", -1)}>
              <ChevronLeft size={16} aria-hidden />
              Back
            </button>
            <button className="primary-link auth-submit" type="button" disabled={!canContinueLocation || submitting} onClick={continueFromLocation}>
              {submitting ? "Creating account" : role === "cleaner" ? "Continue" : "Create account"}
            </button>
          </div>
        </>
      );
    }

    if (step === "personal_info") {
      return (
        <>
          <div className="auth-heading">
            <h1>Personal information</h1>
          </div>
          <form className="auth-form signup-personal-form" onSubmit={submitPersonalInfo} noValidate>
            <div className="form-grid">
              <fieldset className="signup-sex-field">
                <legend>Sex</legend>
                <div className={personalErrors.sex ? "signup-sex-options input-invalid" : "signup-sex-options"} role="group" aria-label="Sex">
                  {sexOptions.map((option) => (
                    <button type="button" key={option.value} className={sex === option.value ? "signup-sex-option selected" : "signup-sex-option"} aria-pressed={sex === option.value} onClick={() => { setSex(option.value); setPersonalErrors((prev) => ({ ...prev, sex: undefined })); }}>
                      {option.label}
                    </button>
                  ))}
                </div>
                {personalErrors.sex ? <small className="field-error-text">{personalErrors.sex}</small> : null}
              </fieldset>
              <div className="signup-birthdate-field">
                <span>Date of birth</span>
                <div className={personalErrors.birth_date ? "birthdate-picker input-invalid" : "birthdate-picker"}>
                  <div className="birthdate-input-row">
                    <input type="date" value={birthDate} min={minBirthDate} max={maxBirthDate} onChange={(event) => changeBirthDate(event.target.value)} aria-label="Date of birth" className="birthdate-input" />
                    <button type="button" className="birthdate-toggle" onClick={() => setCalendarOpen((open) => !open)} aria-label="Choose birth date from calendar" aria-expanded={calendarOpen}>
                      <CalendarDays size={18} aria-hidden />
                    </button>
                  </div>
                  {calendarOpen ? (
                    <div className="birthdate-calendar">
                      <div className="birthdate-calendar-head">
                        <div className="birthdate-month-selectors">
                          <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))} aria-label="Birth month">
                            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                          </select>
                          <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))} aria-label="Birth year">
                            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                          </select>
                        </div>
                        <div className="birthdate-month-arrows">
                          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={22} aria-hidden /></button>
                          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={22} aria-hidden /></button>
                        </div>
                      </div>
                      <div className="birthdate-weekdays">
                        {weekdayLabels.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                      </div>
                      <div className="birthdate-days">
                        {Array.from({ length: monthOffset(calendarYear, calendarMonth) }, (_, index) => <span className="birthdate-empty-day" key={`empty-${index}`} />)}
                        {Array.from({ length: daysInMonth(calendarYear, calendarMonth) }, (_, index) => {
                          const day = index + 1;
                          const value = dateValue(new Date(calendarYear, calendarMonth, day));
                          return (
                            <button type="button" key={value} className={birthDate === value ? "birthdate-day selected" : "birthdate-day"} onClick={() => selectDay(day)} disabled={!isAdultBirthDate(value)}>
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {personalErrors.birth_date ? <small className="field-error-text">{personalErrors.birth_date}</small> : null}
              </div>
            </div>
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("role", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
              <button className="primary-link auth-submit" type="submit">Continue</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "native_language") {
      return (
        <>
          <div className="auth-heading">
            <h1>Native language</h1>
          </div>
          <form className="auth-form signup-experience-form" onSubmit={continueFromLanguage} noValidate>
            <div className="signup-experience-options" role="radiogroup" aria-label="Native language">
              {primaryLanguageOptions.map((option) => {
                const selected = languageChoice === option.value;
                const checked = option.value === "other" ? selected && Boolean(otherLanguage) : selected;
                if (option.value === "other") {
                  return (
                    <div className="signup-language-other-wrap" key={option.value}>
                      <button type="button" className={selected ? "signup-experience-option signup-language-other-trigger selected" : "signup-experience-option signup-language-other-trigger"} aria-checked={selected} role="radio" onClick={() => { setLanguageChoice(option.value); setOtherDropdownOpen((open) => (languageChoice === option.value ? !open : true)); setLanguageError(""); }}>
                        <span>{otherLanguage || option.label}</span>
                        <span className="signup-language-other-icons">
                          {checked ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                          <ChevronDown size={18} aria-hidden />
                        </span>
                      </button>
                      {selected && otherDropdownOpen ? (
                        <div className="signup-language-dropdown" id="signup-other-language-list" role="listbox" aria-label="Other languages">
                          {otherLanguageOptions.map((language) => (
                            <button type="button" key={language} className={otherLanguage === language ? "signup-language-dropdown-option selected" : "signup-language-dropdown-option"} role="option" aria-selected={otherLanguage === language} onClick={() => { setOtherLanguage(language); setOtherDropdownOpen(false); setLanguageError(""); }}>
                              {language}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <button type="button" key={option.value} className={selected ? "signup-experience-option selected" : "signup-experience-option"} aria-checked={selected} role="radio" onClick={() => { setLanguageChoice(option.value); setOtherLanguage(""); setOtherDropdownOpen(false); setLanguageError(""); }}>
                    <span>{option.label}</span>
                    {checked ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                  </button>
                );
              })}
            </div>
            {languageError ? <p className="form-error">{languageError}</p> : null}
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("location", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
              <button className="primary-link auth-submit" type="submit" disabled={!selectedNativeLanguage()}>Continue</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "experience") {
      return (
        <>
          <div className="auth-heading">
            <h1>Do you have experience?</h1>
          </div>
          <form className="auth-form signup-experience-form" onSubmit={submitExperience} noValidate>
            <div className="signup-experience-options" role="radiogroup" aria-label="Cleaning experience">
              {experienceOptions.map((option) => {
                const selected = experience === option.value;
                return (
                  <button type="button" key={option.value} className={selected ? "signup-experience-option selected" : "signup-experience-option"} aria-checked={selected} role="radio" onClick={() => { setExperience(option.value); setExperienceError(""); }}>
                    <span>{option.label}</span>
                    {selected ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                  </button>
                );
              })}
            </div>
            {experienceError ? <p className="form-error">{experienceError}</p> : null}
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("native_language", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
              <button className="primary-link auth-submit" type="submit" disabled={!experience}>Continue</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "availability") {
      return (
        <>
          <div className="auth-heading">
            <h1>When are you available to work?</h1>
          </div>
          <form className="auth-form signup-availability-form" onSubmit={submitAvailability} noValidate>
            <section className="signup-availability-section" aria-labelledby="job-type-preference-title">
              <h2 id="job-type-preference-title">Job preference</h2>
              <div className="signup-availability-choice-grid signup-job-type-grid" role="radiogroup" aria-label="Job preference">
                {jobTypePreferenceOptions.map((option) => {
                  const selected = jobTypePreference === option.value;
                  return (
                    <button type="button" key={option.value} className={selected ? "signup-experience-option selected" : "signup-experience-option"} role="radio" aria-checked={selected} onClick={() => { setJobTypePreference(option.value); setAvailabilityError(""); }}>
                      <span>{option.label}</span>
                      {selected ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="signup-availability-section" aria-labelledby="weekly-availability-title">
              <h2 id="weekly-availability-title">Weekly availability</h2>
              <div className="signup-weekly-availability-grid" role="group" aria-label="Weekly availability">
                <span className="signup-weekly-availability-corner" aria-hidden />
                {weeklyTimeOptions.map((slot) => (
                  <span className="signup-weekly-availability-head" key={slot.value}>{slot.label}</span>
                ))}
                {weeklyDayOptions.map((day) => (
                  <div className="signup-weekly-availability-row" key={day.value}>
                    <span className="signup-weekly-availability-day">{day.label}</span>
                    {weeklyTimeOptions.map((slot) => {
                      const selected = weeklyAvailability[day.value]?.includes(slot.value) ?? false;
                      return (
                        <button
                          type="button"
                          key={`${day.value}-${slot.value}`}
                          className={selected ? "signup-weekly-availability-cell selected" : "signup-weekly-availability-cell"}
                          aria-pressed={selected}
                          aria-label={`${day.label} ${slot.label}`}
                          onClick={() => toggleWeeklyAvailabilitySlot(day.value, slot.value)}
                        >
                          {selected ? <Check size={15} aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>

            {availabilityError ? <p className="form-error">{availabilityError}</p> : null}
            {submitError ? <p className="form-error">{submitError}</p> : null}
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("experience", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
              <button className="primary-link auth-submit" type="submit" disabled={!jobTypePreference || weeklyAvailabilitySlotCount(weeklyAvailability) === 0}>Continue</button>
            </div>
          </form>
        </>
      );
    }

    return (
      <>
        <div className="auth-heading">
          <h1>Introduce yourself</h1>
        </div>
        <form className="auth-form signup-introduction-form" onSubmit={submitIntroduction} noValidate>
          <label className="signup-introduction-label">
            <span>Your introduction</span>
            <textarea
              aria-invalid={Boolean(introductionError)}
              className={introductionError ? "input-invalid" : ""}
              maxLength={introductionMaxLength}
              onBlur={() => setIntroductionFocused(false)}
              onChange={(event) => changeIntroduction(event.target.value)}
              onFocus={() => setIntroductionFocused(true)}
              placeholder={introductionFocused ? "" : "Hosts read descriptions to find the best match.\nShare your experience, work style, and what makes you reliable.\nMake your profile feel clear and trustworthy."}
              ref={introductionInputRef}
              style={{ height: 200 }}
              value={introduction}
            />
            <span className={introduction.length >= introductionMaxLength ? "signup-character-count at-limit" : "signup-character-count"}>
              {introduction.length}/{introductionMaxLength}
            </span>
            {introductionError ? <small className="field-error-text">{introductionError}</small> : null}
          </label>
          {submitError ? <p className="form-error">{submitError}</p> : null}
          <div className="signup-nav-actions">
            <button type="button" className="secondary-link" onClick={() => goTo("availability", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
            <button className="primary-link auth-submit" type="submit" disabled={submitting}>{submitting ? "Creating account" : "Create account"}</button>
          </div>
        </form>
      </>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-wizard-panel">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>
        {hasProgress(step) ? (
          <div className="signup-progress-wrap" aria-label="Signup progress">
            <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <div className="signup-progress-fill signup-progress-fill-dynamic" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : <div className="signup-progress-placeholder" aria-hidden />}
        <div className={step === "personal_info" && calendarOpen ? "signup-wizard-frame signup-wizard-frame--overlay-open" : "signup-wizard-frame"}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (nextDirection: Direction) => ({ opacity: 0, x: prefersReducedMotion ? 0 : nextDirection > 0 ? 44 : -44 }),
                center: { opacity: 1, x: 0 },
                exit: (nextDirection: Direction) => ({ opacity: 0, x: prefersReducedMotion ? 0 : nextDirection > 0 ? -44 : 44 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: "easeInOut" }}
              className="signup-wizard-motion"
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
      {showEmptyBioPrompt ? (
        <div className="signup-empty-bio-backdrop" role="dialog" aria-modal="true" aria-labelledby="empty-bio-title" aria-describedby="empty-bio-description">
          <div className="signup-empty-bio-modal">
            <h2 id="empty-bio-title">Improve your matching by 75%!</h2>
            <p id="empty-bio-description">
              A short bio helps hosts understand a cleaner&apos;s experience, reliability, and work style before they choose who to work with.
              You can add one now, or create the account and update it later.
            </p>
            <div className="signup-empty-bio-footer">
              <div className="signup-empty-bio-icon" aria-hidden>
                <Sparkles size={24} />
              </div>
              <div className="signup-empty-bio-actions">
                <button type="button" className="primary-link auth-submit" onClick={returnToIntroduction}>
                  Add Bio
                </button>
                <button type="button" className="signup-empty-bio-text-action" onClick={createAccountWithoutBio} disabled={submitting}>
                  {submitting ? "Creating account" : "Finish registration"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

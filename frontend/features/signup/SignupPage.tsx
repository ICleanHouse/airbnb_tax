"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
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
  User,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch, UserRole } from "../../lib/api";
import { cities } from "../../lib/cityDistricts";
import { fallbackServiceZones, serviceAreaNamesToZoneIds, zoneIdsToServiceAreaNames } from "../../lib/locations";
import { clearSignupRecovery, restoreSignupRecovery, saveSignupRecovery } from "./signupRecovery";

type SignupRole = Extract<UserRole, "host" | "cleaner" | "agency">;
type SignupStep = "account" | "confirm_email" | "role" | "location" | "personal_info" | "native_language" | "experience" | "introduction" | "profile_photo";
type SignupField = "first_name" | "last_name" | "email" | "password" | "password_confirm" | "form";
type SignupFieldErrors = Partial<Record<SignupField, string>>;
type PersonalInfoErrors = Partial<Record<"birth_date" | "sex", string>>;
type Direction = 1 | -1;
type CropSource = {
  src: string;
  width: number;
  height: number;
};

type SignupDraft = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirm: string;
};

type EmailErrorKey = "emailRequired" | "emailInvalid" | "emailDomain" | "emailDomainHyphen" | "emailDomainChars" | "emailEnding";

const primaryLanguageOptions = [
  { value: "Български" },
  { value: "Русский" },
  { value: "English" },
  { value: "Română" },
  { value: "Српски" },
  { value: "Ελληνικά" },
  { value: "other" },
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
const introductionMaxLength = 1500;
const PROFILE_CROP_PREVIEW_SIZE = 360;
const PROFILE_CROP_EXPORT_SIZE = 720;
const PROFILE_CROP_MIN_ZOOM = 1;
const PROFILE_CROP_MAX_ZOOM = 3;

function hasPasswordRequirements(value: string) {
  return value.length >= 8
    && /\p{L}/u.test(value)
    && /\p{N}/u.test(value)
    && /[^\p{L}\p{N}]/u.test(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function profileCropBaseScale(source: CropSource, canvasSize: number) {
  return Math.max(canvasSize / source.width, canvasSize / source.height);
}

function clampProfileCropOffset(offset: { x: number; y: number }, source: CropSource, zoom: number, canvasSize: number) {
  const drawScale = profileCropBaseScale(source, canvasSize) * zoom;
  const drawWidth = source.width * drawScale;
  const drawHeight = source.height * drawScale;
  const maxX = Math.max(0, (drawWidth - canvasSize) / 2);
  const maxY = Math.max(0, (drawHeight - canvasSize) / 2);
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

function validateEmailAddress(rawEmail: string): EmailErrorKey | null {
  const email = rawEmail.trim();
  if (!email) return "emailRequired";
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex !== email.indexOf("@") || atIndex === email.length - 1) return "emailInvalid";
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1).toLowerCase();
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..") || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return "emailInvalid";
  }
  const labels = domainPart.split(".");
  if (labels.length < 2) return "emailDomain";
  for (const label of labels) {
    if (!label) return "emailDomain";
    if (label.startsWith("-") || label.endsWith("-")) return "emailDomainHyphen";
    if (!/^[a-z0-9-]+$/.test(label)) return "emailDomainChars";
  }
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return "emailEnding";
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

function stepIndex(step: SignupStep, role: SignupRole | null) {
  const steps = role === "cleaner"
    ? ["role", "personal_info", "location", "native_language", "experience", "introduction", "profile_photo"]
    : ["role", "location"];
  return Math.max(0, steps.indexOf(step));
}

function hasProgress(step: SignupStep) {
  return step !== "account" && step !== "confirm_email";
}

export default function SignupPage() {
  const tS = useTranslations("signup");
  const tC = useTranslations("common");

  const monthNames = tC.raw("months") as string[];
  const weekdayLabels = tC.raw("weekdays") as string[];

  const roles: Array<{ value: SignupRole; label: string; description: string; icon: typeof Home }> = [
    { value: "host", label: tS("role.host.label"), description: tS("role.host.description"), icon: Home },
    { value: "cleaner", label: tS("role.cleaner.label"), description: tS("role.cleaner.description"), icon: Sparkles },
    { value: "agency", label: tS("role.agency.label"), description: tS("role.agency.description"), icon: Building2 },
  ];
  const sexOptions = [
    { value: "male", label: tS("personalInfo.male") },
    { value: "female", label: tS("personalInfo.female") },
    { value: "prefer_not_to_say", label: tS("personalInfo.preferNotToSay") },
  ];
  const experienceOptions = [
    { value: "none", label: tS("experience.none") },
    { value: "1_year", label: tS("experience.1year") },
    { value: "2_years", label: tS("experience.2years") },
    { value: "3_years", label: tS("experience.3years") },
    { value: "4_years", label: tS("experience.4years") },
    { value: "5_years", label: tS("experience.5years") },
    { value: "more_than_5_years", label: tS("experience.moreThan5") },
  ];
  const emailErrorMessages: Record<EmailErrorKey, string> = {
    emailRequired: tS("account.error.emailRequired"),
    emailInvalid: tS("account.error.emailInvalid"),
    emailDomain: tS("account.error.emailDomain"),
    emailDomainHyphen: tS("account.error.emailDomainHyphen"),
    emailDomainChars: tS("account.error.emailDomainChars"),
    emailEnding: tS("account.error.emailEnding"),
  };

  const prefersReducedMotion = useReducedMotion();
  const cutoffDate = adultCutoffDate();
  const yearOptions = Array.from({ length: 83 }, (_, index) => cutoffDate.getFullYear() - index);
  const minBirthDate = `${yearOptions[yearOptions.length - 1]}-01-01`;
  const maxBirthDate = dateValue(cutoffDate);

  const [step, setStep] = useState<SignupStep>("account");
  const [direction, setDirection] = useState<Direction>(1);
  const [restored, setRestored] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailVerificationToken, setEmailVerificationToken] = useState("");
  const [role, setRole] = useState<SignupRole | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState("");
  const [languageChoice, setLanguageChoice] = useState("");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [experience, setExperience] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [showEmptyPhotoPrompt, setShowEmptyPhotoPrompt] = useState(false);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [cropImageElement, setCropImageElement] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState(PROFILE_CROP_MIN_ZOOM);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState("");
  const [cropDragging, setCropDragging] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [codeInputFocused, setCodeInputFocused] = useState(false);
  const [personalErrors, setPersonalErrors] = useState<PersonalInfoErrors>({});
  const [languageError, setLanguageError] = useState("");
  const [experienceError, setExperienceError] = useState("");
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
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const introductionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const recovery = restoreSignupRecovery(sessionStorage);
    if (recovery) {
      setRole(recovery.role);
      setCity(recovery.citySlug);
      setSelectedZones(new Set(zoneIdsToServiceAreaNames(
        recovery.selectedZoneIds,
        fallbackServiceZones(recovery.citySlug),
      )));
      setExperience(recovery.experienceLevel);
      setRecoveryNotice(true);
    }
    // Credentials, codes, tokens, and sensitive profile fields intentionally
    // start empty after refresh. Recovery always resumes at the account step.
    setStep("account");
    setRestored(true);
  }, []);

  // Preselect the role from a ?role= deep link (e.g. landing CTAs) once the
  // wizard has restored, but only if nothing was already in progress.
  useEffect(() => {
    if (!restored || role) return;
    const param = new URLSearchParams(window.location.search).get("role");
    if (param === "host" || param === "cleaner" || param === "agency") setRole(param);
  }, [restored, role]);

  useEffect(() => {
    if (!restored) return;
    saveSignupRecovery(sessionStorage, {
      role,
      citySlug: city,
      selectedZoneIds: serviceAreaNamesToZoneIds(
        Array.from(selectedZones),
        fallbackServiceZones(city),
      ),
      experienceLevel: experience,
    });
  }, [city, experience, restored, role, selectedZones]);

  useEffect(() => {
    const input = introductionInputRef.current;
    if (!input || step !== "introduction") return;
    input.style.height = "auto";
    input.style.height = `${Math.max(200, input.scrollHeight)}px`;
  }, [introduction, step]);

  useEffect(() => {
    if (!cropSource) {
      setCropImageElement(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setCropImageElement(image);
    image.onerror = () => setCropError(tS("cropModal.error.loadPreview"));
    image.src = cropSource.src;
  // tS is stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropSource]);

  useEffect(() => {
    if (!cropSource) return;
    setCropOffset((current) => {
      const constrained = clampProfileCropOffset(current, cropSource, cropZoom, PROFILE_CROP_PREVIEW_SIZE);
      if (constrained.x === current.x && constrained.y === current.y) return current;
      return constrained;
    });
  }, [cropSource, cropZoom]);

  useEffect(() => {
    drawCropPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropSource, cropImageElement, cropZoom, cropOffset]);

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

  const passwordChecks = [
    { label: tS("account.passwordCheck.length"), passed: password.length >= 8 },
    { label: tS("account.passwordCheck.letter"), passed: /\p{L}/u.test(password) },
    { label: tS("account.passwordCheck.number"), passed: /\p{N}/u.test(password) },
    { label: tS("account.passwordCheck.special"), passed: /[^\p{L}\p{N}]/u.test(password) },
  ];

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
    setShowEmptyPhotoPrompt(false);
    setStep(nextStep);
  }

  function clearSensitiveSignupState() {
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setEmailVerificationToken("");
    setProfileImage("");
    setCropSource(null);
    setCropImageElement(null);
  }

  function cancelSignup() {
    clearSignupRecovery(sessionStorage);
    clearSensitiveSignupState();
  }

  function resetSignup() {
    clearSignupRecovery(sessionStorage);
    clearSensitiveSignupState();
    setStep("account");
    setDirection(-1);
    setRecoveryNotice(false);
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole(null);
    setCompanyName("");
    setCity("");
    setSelectedZones(new Set());
    setBirthDate("");
    setSex("");
    setLanguageChoice("");
    setOtherLanguage("");
    setExperience("");
    setIntroduction("");
    setFieldErrors({});
    setPersonalErrors({});
    setCodeError("");
    setCodeNotice("");
    setLanguageError("");
    setExperienceError("");
    setIntroductionError("");
    setSubmitError("");
    setProfileImageError("");
    setShowEmptyBioPrompt(false);
    setShowEmptyPhotoPrompt(false);
    setCalendarOpen(false);
    setAvailableChoice("");
    setSelectedChoice("");
    setDistrictSearch("");
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
        setSubmitError(typeof data.detail === "string" ? data.detail : tS("account.error.createFallback"));
        setSubmitting(false);
        return;
      }
      clearSignupRecovery(sessionStorage);
      clearSensitiveSignupState();
      window.location.href = "/app";
    } catch {
      setSubmitError(tS("account.error.createNetwork"));
      setSubmitting(false);
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: SignupFieldErrors = {};
    if (!firstName.trim()) nextErrors.first_name = tS("account.error.firstNameRequired");
    if (!lastName.trim()) nextErrors.last_name = tS("account.error.lastNameRequired");
    const emailErrorKey = validateEmailAddress(email);
    if (emailErrorKey) nextErrors.email = emailErrorMessages[emailErrorKey];
    const hasPasswordRules = hasPasswordRequirements(password);
    if (!hasPasswordRules) nextErrors.password = tS("account.error.passwordWeak");
    if (password !== confirmPassword) nextErrors.password_confirm = tS("account.error.passwordMatch");
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setCode("");
    setEmailVerificationToken("");
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
        else nextErrors.form = tS("account.error.codeNotSent");
        setFieldErrors(nextErrors);
        setSubmitting(false);
        return;
      }
      const data = await response.json().catch(() => ({}));
      setCode("");
      if (typeof data.email_verification_token === "string") {
        setEmailVerificationToken(data.email_verification_token);
        setRecoveryNotice(false);
        setSubmitting(false);
        goTo("role", 1);
        return;
      }
      setRecoveryNotice(false);
      setSubmitting(false);
      goTo("confirm_email", 1);
    } catch {
      setFieldErrors({ form: tS("account.error.codeNotSentNetwork") });
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalizedCode = code.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setCodeError(tS("confirmEmail.error.codeShort"));
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
        setCodeError(typeof nextCodeError === "string" ? nextCodeError : tS("confirmEmail.error.codeIncorrect"));
        setSubmitting(false);
        return;
      }
      if (typeof data.email_verification_token !== "string") {
        setCodeError(tS("confirmEmail.error.verifyFailed"));
        setSubmitting(false);
        return;
      }
      setCode("");
      setEmailVerificationToken(data.email_verification_token);
      setSubmitting(false);
      goTo("role", 1);
    } catch {
      setCodeError(tS("confirmEmail.error.verifyNetwork"));
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (resending) return;
    setEmailVerificationToken("");
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
        setCodeError(tS("confirmEmail.error.resendFailed"));
        setResending(false);
        return;
      }
      const data = await response.json().catch(() => ({}));
      setCode("");
      if (typeof data.email_verification_token === "string") {
        setEmailVerificationToken(data.email_verification_token);
        setCodeNotice(tS("confirmEmail.notice.verificationDisabled"));
        setResending(false);
        goTo("role", 1);
        return;
      }
      setCodeNotice(tS("confirmEmail.notice.codeSent"));
      setResending(false);
    } catch {
      setCodeError(tS("confirmEmail.error.resendNetwork"));
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
      ...(role === "host" && companyName.trim() ? { company_name: companyName.trim() } : {}),
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
    if (!birthDate) nextErrors.birth_date = tS("personalInfo.error.birthDateRequired");
    else if (!isValidDateValue(birthDate)) nextErrors.birth_date = tS("personalInfo.error.birthDateInvalid");
    else if (!isAdultBirthDate(birthDate)) nextErrors.birth_date = tS("personalInfo.error.birthDateAge");
    if (!sex) nextErrors.sex = tS("personalInfo.error.sexRequired");
    if (Object.keys(nextErrors).length > 0) {
      setPersonalErrors(nextErrors);
      return;
    }
    goTo("location", 1);
  }

  function continueFromLanguage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNativeLanguage()) {
      setLanguageError(languageChoice === "other" ? tS("language.error.chooseFromDropdown") : tS("language.error.chooseLanguage"));
      return;
    }
    goTo("experience", 1);
  }

  function submitExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (!experience) {
      setExperienceError(tS("experience.error.choose"));
      return;
    }
    goTo("introduction", 1);
  }

  function changeIntroduction(value: string) {
    setIntroduction(value.slice(0, introductionMaxLength));
    setIntroductionError("");
    setShowEmptyBioPrompt(false);
  }

  function closeCropEditor() {
    setCropSource(null);
    setCropImageElement(null);
    setCropZoom(PROFILE_CROP_MIN_ZOOM);
    setCropOffset({ x: 0, y: 0 });
    setCropBusy(false);
    setCropError("");
    setCropDragging(false);
    cropDragStateRef.current = null;
  }

  function setCropZoomLevel(nextZoom: number) {
    const normalizedZoom = clamp(nextZoom, PROFILE_CROP_MIN_ZOOM, PROFILE_CROP_MAX_ZOOM);
    setCropZoom(normalizedZoom);
    if (!cropSource) return;
    setCropOffset((current) => clampProfileCropOffset(current, cropSource, normalizedZoom, PROFILE_CROP_PREVIEW_SIZE));
  }

  function drawCropPreview() {
    if (!cropSource || !cropImageElement) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const canvasSize = PROFILE_CROP_PREVIEW_SIZE;
    const constrainedOffset = clampProfileCropOffset(cropOffset, cropSource, cropZoom, canvasSize);

    context.clearRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvasSize, canvasSize);

    const scale = profileCropBaseScale(cropSource, canvasSize) * cropZoom;
    const drawWidth = cropSource.width * scale;
    const drawHeight = cropSource.height * scale;
    const drawX = (canvasSize - drawWidth) / 2 + constrainedOffset.x;
    const drawY = (canvasSize - drawHeight) / 2 + constrainedOffset.y;
    context.drawImage(cropImageElement, drawX, drawY, drawWidth, drawHeight);
  }

  function applyCropResult() {
    if (!cropSource || !cropImageElement) return;

    setCropBusy(true);
    setCropError("");

    try {
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = PROFILE_CROP_EXPORT_SIZE;
      outputCanvas.height = PROFILE_CROP_EXPORT_SIZE;
      const context = outputCanvas.getContext("2d");
      if (!context) {
        setCropError(tS("cropModal.error.prepareCrop"));
        setCropBusy(false);
        return;
      }

      const constrainedOffset = clampProfileCropOffset(cropOffset, cropSource, cropZoom, PROFILE_CROP_PREVIEW_SIZE);
      const ratio = PROFILE_CROP_EXPORT_SIZE / PROFILE_CROP_PREVIEW_SIZE;
      const scale = profileCropBaseScale(cropSource, PROFILE_CROP_EXPORT_SIZE) * cropZoom;
      const drawWidth = cropSource.width * scale;
      const drawHeight = cropSource.height * scale;
      const drawX = (PROFILE_CROP_EXPORT_SIZE - drawWidth) / 2 + constrainedOffset.x * ratio;
      const drawY = (PROFILE_CROP_EXPORT_SIZE - drawHeight) / 2 + constrainedOffset.y * ratio;

      context.clearRect(0, 0, PROFILE_CROP_EXPORT_SIZE, PROFILE_CROP_EXPORT_SIZE);
      context.drawImage(cropImageElement, drawX, drawY, drawWidth, drawHeight);

      setProfileImage(outputCanvas.toDataURL("image/jpeg", 0.92));
      setProfileImageError("");
      setShowEmptyPhotoPrompt(false);
      closeCropEditor();
    } catch {
      setCropError(tS("cropModal.error.applyCrop"));
      setCropBusy(false);
    }
  }

  function onCropPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!cropSource) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    cropDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };
    setCropDragging(true);
  }

  function onCropPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!cropSource) return;
    const dragState = cropDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffset = clampProfileCropOffset(
      {
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      },
      cropSource,
      cropZoom,
      PROFILE_CROP_PREVIEW_SIZE,
    );
    setCropOffset(nextOffset);
  }

  function onCropPointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    const dragState = cropDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragStateRef.current = null;
    setCropDragging(false);
  }

  function onSignupProfileImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileImageError(tS("profilePhoto.error.invalidFile"));
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileImageError(tS("profilePhoto.error.tooLarge"));
      event.target.value = "";
      return;
    }

    setProfileImageError("");
    setCropError("");
    setCropBusy(false);
    setCropZoom(PROFILE_CROP_MIN_ZOOM);
    setCropOffset({ x: 0, y: 0 });

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const image = new window.Image();
        image.onload = () => {
          setCropSource({
            src: reader.result as string,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        };
        image.onerror = () => {
          setProfileImageError(tS("profilePhoto.error.openFailed"));
        };
        image.src = reader.result;
      }
    };
    reader.onerror = () => setProfileImageError(tS("profilePhoto.error.readFailed"));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function createCleanerAccount() {
    if (!selectedCity || !emailVerificationToken) return;
    setShowEmptyPhotoPrompt(false);
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
      bio: introduction.trim(),
      profile_image: profileImage,
    });
  }

  function submitIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (introduction.length > introductionMaxLength) {
      setIntroductionError(tS("introduction.error.tooLong", { max: introductionMaxLength }));
      return;
    }
    if (!introduction.trim()) {
      setSubmitError("");
      setIntroductionError("");
      setShowEmptyBioPrompt(true);
      return;
    }
    goTo("profile_photo", 1);
  }

  function submitProfilePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (!profileImage) {
      setShowEmptyPhotoPrompt(true);
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
    goTo("profile_photo", 1);
  }

  function openProfilePhotoPicker() {
    setShowEmptyPhotoPrompt(false);
    window.requestAnimationFrame(() => {
      profilePhotoInputRef.current?.click();
    });
  }

  function renderStep() {
    if (step === "account") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("account.heading")}</h1>
            {recoveryNotice ? <p role="status">{tS("recovery.restoredNotice")}</p> : null}
          </div>
          {/* Social sign-up (Google/Apple) is not wired up yet — hidden until
              real OAuth is implemented to avoid dead, trust-eroding buttons. */}
          <form className="auth-form" onSubmit={submitAccount} noValidate>
            <div className="form-grid signup-form-grid">
              <label>
                <span>{tS("account.firstNameLabel")}</span>
                <input autoComplete="given-name" aria-invalid={Boolean(fieldErrors.first_name)} className={fieldErrors.first_name ? "input-invalid" : ""} required value={firstName} onChange={(event) => { setFirstName(event.target.value); clearFieldError("first_name"); }} />
                {fieldErrors.first_name ? <small className="field-error-text">{fieldErrors.first_name}</small> : null}
              </label>
              <label>
                <span>{tS("account.lastNameLabel")}</span>
                <input autoComplete="family-name" aria-invalid={Boolean(fieldErrors.last_name)} className={fieldErrors.last_name ? "input-invalid" : ""} required value={lastName} onChange={(event) => { setLastName(event.target.value); clearFieldError("last_name"); }} />
                {fieldErrors.last_name ? <small className="field-error-text">{fieldErrors.last_name}</small> : null}
              </label>
              <label>
                <span>{tS("account.emailLabel")}</span>
                <input autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} className={fieldErrors.email ? "input-invalid" : ""} required type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); }} />
                {fieldErrors.email ? <small className="field-error-text">{fieldErrors.email}</small> : null}
              </label>
              <label>
                <span>{tS("account.passwordLabel")}</span>
                <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} className={fieldErrors.password ? "input-invalid" : ""} minLength={8} required type="password" value={password} onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }} placeholder={tS("account.passwordPlaceholder")} />
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
                <span>{tS("account.confirmPasswordLabel")}</span>
                <input autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password_confirm)} className={fieldErrors.password_confirm ? "input-invalid" : ""} minLength={8} required type="password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); clearFieldError("password_confirm"); }} />
                {fieldErrors.password_confirm ? <small className="field-error-text">{fieldErrors.password_confirm}</small> : null}
              </label>
            </div>
            {fieldErrors.form ? <p className="form-error">{fieldErrors.form}</p> : null}
            {submitting ? (
              <div className="signup-loading-status" role="status" aria-live="polite">
                <span className="signup-loading-spinner" aria-hidden />
                <span>{tS("account.sendingCode")}</span>
              </div>
            ) : null}
            <button className="primary-link auth-submit" type="submit" disabled={submitting}>
              <UserRoundCheck size={18} aria-hidden />
              {submitting ? tS("account.sendingCodeBtn") : tS("account.createAccount")}
            </button>
          </form>
          <p className="auth-switch">{tS("account.alreadyRegistered")} <Link href="/login" onClick={cancelSignup}>{tS("account.logIn")}</Link></p>
        </>
      );
    }

    if (step === "confirm_email") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("confirmEmail.heading")}</h1>
            <p>{tS("confirmEmail.subtitle", { email: email || "your email" })}</p>
          </div>
          <form className="auth-form signup-code-form" onSubmit={verifyCode} noValidate>
            <label className="signup-code-label">
              <span>{tS("confirmEmail.codeLabel")}</span>
              <div className={codeError ? "signup-code-boxes input-invalid" : "signup-code-boxes"} onClick={() => codeInputRef.current?.focus()}>
                {Array.from({ length: 6 }, (_, index) => (
                  <span className={`${code[index] ? "signup-code-box filled" : "signup-code-box"}${codeInputFocused && code.length < 6 && index === code.length ? " active" : ""}`} key={index}>{code[index] ?? ""}</span>
                ))}
                <input id="signup-code-input" ref={codeInputRef} className="signup-code-input" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }} onFocus={() => setCodeInputFocused(true)} onBlur={() => setCodeInputFocused(false)} autoComplete="one-time-code" aria-label={tS("confirmEmail.codeLabel")} aria-invalid={Boolean(codeError)} autoFocus />
              </div>
              {codeError ? <small className="field-error-text">{codeError}</small> : null}
              {codeNotice ? <small className="signup-code-notice">{codeNotice}</small> : null}
            </label>
            <div className="signup-nav-actions signup-nav-actions--confirm">
              <button className="secondary-link signup-resend-button" type="button" onClick={resendCode} disabled={resending}>
                <RotateCw size={17} aria-hidden />
                {resending ? tS("confirmEmail.resending") : tS("confirmEmail.resend")}
              </button>
              <button className="primary-link auth-submit" type="submit" disabled={submitting || code.length !== 6}>
                <MailCheck size={18} aria-hidden />
                {submitting ? tS("confirmEmail.checking") : tS("confirmEmail.confirm")}
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
            <h1>{tS("role.heading")}</h1>
          </div>
          <div className="role-grid" role="radiogroup" aria-label={tS("role.ariaLabel")}>
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
              {tC("back")}
            </button>
            <button className="primary-link auth-submit" type="button" disabled={!role} onClick={continueFromRole}>
              {tC("continue")}
            </button>
          </div>
        </>
      );
    }

    if (step === "location") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("location.heading")}</h1>
          </div>
          {role === "host" ? (
            <label className="signup-city-picker">
              <span>{tS("location.companyNameLabel")} <small className="signup-optional">{tS("location.optional")}</small></span>
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder={tS("location.companyNamePlaceholder")}
                autoComplete="organization"
              />
            </label>
          ) : null}
          <label className="signup-city-picker">
            <span>{tS("location.cityLabel")}</span>
            <select value={city} onChange={(event) => { setCity(event.target.value); setSelectedZones(new Set()); setAvailableChoice(""); setSelectedChoice(""); setDistrictSearch(""); }}>
              <option value="">{tS("location.cityPlaceholder")}</option>
              {cities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {selectedCity ? (
            <section className="zones-panel" aria-label={`${selectedCity.label} neighborhoods`}>
              <header className="zones-panel-head">
                <strong>{tS("location.areaSelection")}</strong>
                <div className="zones-actions">
                  <button type="button" onClick={selectAllZones}>{tS("location.selectAll")}</button>
                  <button type="button" onClick={clearZones}>{tS("location.clearAll")}</button>
                </div>
              </header>
              <div className="dual-zone-transfer">
                <label className="dual-zone-list">
                  <span>{tS("location.listOfDistricts")}</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label={tS("location.listOfDistricts")} onDragOver={(event) => event.preventDefault()} onDrop={handleDropToAvailable}>
                    <div className="dual-zone-listbox-search-wrap">
                      <input className="dual-zone-search" type="text" placeholder={tS("location.searchDistrict")} value={districtSearch} onChange={(event) => setDistrictSearch(event.target.value)} />
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
                  <button type="button" onClick={addNeighborhood} disabled={!availableChoice} aria-label={tS("location.addNeighborhood")}>▶</button>
                  <button type="button" onClick={removeNeighborhood} disabled={!selectedChoice} aria-label={tS("location.removeNeighborhood")}>◀</button>
                </div>
                <label className="dual-zone-list">
                  <span>{tS("location.selectedDistricts")}</span>
                  <div className="dual-zone-listbox" role="listbox" aria-label={tS("location.selectedDistricts")} onDragOver={(event) => event.preventDefault()} onDrop={handleDropToSelected}>
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
              {tC("back")}
            </button>
            <button className="primary-link auth-submit" type="button" disabled={!canContinueLocation || submitting} onClick={continueFromLocation}>
              {submitting ? tS("location.creatingAccount") : role === "cleaner" ? tC("continue") : tS("location.createAccount")}
            </button>
          </div>
        </>
      );
    }

    if (step === "personal_info") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("personalInfo.heading")}</h1>
          </div>
          <form className="auth-form signup-personal-form" onSubmit={submitPersonalInfo} noValidate>
            <div className="form-grid">
              <fieldset className="signup-sex-field">
                <legend>{tS("personalInfo.sexLegend")}</legend>
                <div className={personalErrors.sex ? "signup-sex-options input-invalid" : "signup-sex-options"} role="group" aria-label={tS("personalInfo.sexLegend")}>
                  {sexOptions.map((option) => (
                    <button type="button" key={option.value} className={sex === option.value ? "signup-sex-option selected" : "signup-sex-option"} aria-pressed={sex === option.value} onClick={() => { setSex(option.value); setPersonalErrors((prev) => ({ ...prev, sex: undefined })); }}>
                      {option.label}
                    </button>
                  ))}
                </div>
                {personalErrors.sex ? <small className="field-error-text">{personalErrors.sex}</small> : null}
              </fieldset>
              <div className="signup-birthdate-field">
                <span>{tS("personalInfo.birthDateLabel")}</span>
                <div className={personalErrors.birth_date ? "birthdate-picker input-invalid" : "birthdate-picker"}>
                  <div className="birthdate-input-row">
                    <input type="date" value={birthDate} min={minBirthDate} max={maxBirthDate} onChange={(event) => changeBirthDate(event.target.value)} aria-label={tS("personalInfo.birthDateLabel")} className="birthdate-input" />
                    <button type="button" className="birthdate-toggle" onClick={() => setCalendarOpen((open) => !open)} aria-label={tS("personalInfo.calendarAriaLabel")} aria-expanded={calendarOpen}>
                      <CalendarDays size={18} aria-hidden />
                    </button>
                  </div>
                  {calendarOpen ? (
                    <div className="birthdate-calendar">
                      <div className="birthdate-calendar-head">
                        <div className="birthdate-month-selectors">
                          <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))} aria-label={tS("personalInfo.monthAriaLabel")}>
                            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                          </select>
                          <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))} aria-label={tS("personalInfo.yearAriaLabel")}>
                            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                          </select>
                        </div>
                        <div className="birthdate-month-arrows">
                          <button type="button" onClick={() => moveMonth(-1)} aria-label={tS("personalInfo.prevMonthAriaLabel")}><ChevronLeft size={22} aria-hidden /></button>
                          <button type="button" onClick={() => moveMonth(1)} aria-label={tS("personalInfo.nextMonthAriaLabel")}><ChevronRight size={22} aria-hidden /></button>
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
              <button type="button" className="secondary-link" onClick={() => goTo("role", -1)}><ChevronLeft size={16} aria-hidden />{tC("back")}</button>
              <button className="primary-link auth-submit" type="submit">{tC("continue")}</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "native_language") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("language.heading")}</h1>
          </div>
          <form className="auth-form signup-experience-form" onSubmit={continueFromLanguage} noValidate>
            <div className="signup-experience-options" role="radiogroup" aria-label={tS("language.ariaLabel")}>
              {primaryLanguageOptions.map((option) => {
                const selected = languageChoice === option.value;
                const checked = option.value === "other" ? selected && Boolean(otherLanguage) : selected;
                const displayLabel = option.value === "other" ? tS("language.other") : option.value;
                if (option.value === "other") {
                  return (
                    <div className="signup-language-other-wrap" key={option.value}>
                      <button type="button" className={selected ? "signup-experience-option signup-language-other-trigger selected" : "signup-experience-option signup-language-other-trigger"} aria-checked={selected} role="radio" onClick={() => { setLanguageChoice(option.value); setOtherDropdownOpen((open) => (languageChoice === option.value ? !open : true)); setLanguageError(""); }}>
                        <span>{otherLanguage || displayLabel}</span>
                        <span className="signup-language-other-icons">
                          {checked ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                          <ChevronDown size={18} aria-hidden />
                        </span>
                      </button>
                      {selected && otherDropdownOpen ? (
                        <div className="signup-language-dropdown" id="signup-other-language-list" role="listbox" aria-label={tS("language.otherDropdownAriaLabel")}>
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
                    <span>{displayLabel}</span>
                    {checked ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                  </button>
                );
              })}
            </div>
            {languageError ? <p className="form-error">{languageError}</p> : null}
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("location", -1)}><ChevronLeft size={16} aria-hidden />{tC("back")}</button>
              <button className="primary-link auth-submit" type="submit" disabled={!selectedNativeLanguage()}>{tC("continue")}</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "experience") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("experience.heading")}</h1>
          </div>
          <form className="auth-form signup-experience-form" onSubmit={submitExperience} noValidate>
            <div className="signup-experience-options" role="radiogroup" aria-label={tS("experience.ariaLabel")}>
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
              <button type="button" className="secondary-link" onClick={() => goTo("native_language", -1)}><ChevronLeft size={16} aria-hidden />{tC("back")}</button>
              <button className="primary-link auth-submit" type="submit" disabled={!experience}>{tC("continue")}</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "introduction") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("introduction.heading")}</h1>
          </div>
          <form className="auth-form signup-introduction-form" onSubmit={submitIntroduction} noValidate>
            <label className="signup-introduction-label">
              <span>{tS("introduction.label")}</span>
              <textarea
                aria-invalid={Boolean(introductionError)}
                className={introductionError ? "input-invalid" : ""}
                maxLength={introductionMaxLength}
                onBlur={() => setIntroductionFocused(false)}
                onChange={(event) => changeIntroduction(event.target.value)}
                onFocus={() => setIntroductionFocused(true)}
                placeholder={introductionFocused ? "" : tS("introduction.placeholder")}
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
              <button type="button" className="secondary-link" onClick={() => goTo("experience", -1)}><ChevronLeft size={16} aria-hidden />{tC("back")}</button>
              <button className="primary-link auth-submit" type="submit">{tC("continue")}</button>
            </div>
          </form>
        </>
      );
    }

    if (step === "profile_photo") {
      return (
        <>
          <div className="auth-heading">
            <h1>{tS("profilePhoto.heading")}</h1>
            <p>{tS("profilePhoto.subtitle")}</p>
          </div>
          <form className="auth-form signup-profile-photo-form" onSubmit={submitProfilePhoto} noValidate>
            <div className="signup-profile-photo-preview-wrap">
              <button
                type="button"
                className={profileImage ? "signup-profile-photo-trigger has-image" : "signup-profile-photo-trigger"}
                onClick={openProfilePhotoPicker}
                aria-label={profileImage ? tS("profilePhoto.editAriaLabel") : tS("profilePhoto.uploadAriaLabel")}
              >
                <div className="signup-profile-photo-preview" aria-label={tS("profilePhoto.previewAriaLabel")}>
                  {profileImage ? (
                    <Image src={profileImage} alt="Selected profile" width={148} height={148} unoptimized />
                  ) : (
                    <span className="signup-profile-photo-placeholder" aria-hidden>
                      <User size={48} />
                    </span>
                  )}
                  <span className="signup-profile-photo-hover-hint">{profileImage ? tS("profilePhoto.editHint") : tS("profilePhoto.uploadHint")}</span>
                </div>
              </button>
            </div>
            <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={onSignupProfileImageChange} hidden />
            {profileImageError ? <p className="form-error">{profileImageError}</p> : null}
            {submitError ? <p className="form-error">{submitError}</p> : null}
            <div className="signup-nav-actions">
              <button type="button" className="secondary-link" onClick={() => goTo("introduction", -1)}><ChevronLeft size={16} aria-hidden />{tC("back")}</button>
              <button className="primary-link auth-submit" type="submit" disabled={submitting}>{submitting ? tS("profilePhoto.creatingAccount") : tS("profilePhoto.createAccount")}</button>
            </div>
          </form>
        </>
      );
    }

    return null;
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-wizard-panel">
        <Link className="site-brand auth-brand" href="/" onClick={cancelSignup}>
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>{tS("brandName")}</strong>
        </Link>
        {hasProgress(step) ? (
          <div className="signup-progress-wrap" aria-label="Signup progress">
            <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <div className="signup-progress-fill signup-progress-fill-dynamic" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : <div className="signup-progress-placeholder" aria-hidden />}
        {hasProgress(step) || recoveryNotice ? (
          <button type="button" className="secondary-link" onClick={resetSignup}>
            {tS("recovery.startOver")}
          </button>
        ) : null}
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
      {cropSource ? (
        <div
          className="host-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-crop-title"
          onClick={closeCropEditor}
        >
          <div className="host-modal cleaner-crop-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2 id="signup-crop-title">{tS("cropModal.title")}</h2>
              <button type="button" className="host-modal-close" onClick={closeCropEditor} aria-label={tS("cropModal.closeAriaLabel")}>
                ×
              </button>
            </div>
            <div className="cleaner-crop-modal-body">
              <p className="cleaner-crop-hint">
                {tS("cropModal.hint")}
              </p>
              <div className="cleaner-crop-canvas-wrap">
                <canvas
                  ref={cropCanvasRef}
                  className={cropDragging ? "cleaner-crop-canvas dragging" : "cleaner-crop-canvas"}
                  width={PROFILE_CROP_PREVIEW_SIZE}
                  height={PROFILE_CROP_PREVIEW_SIZE}
                  onPointerDown={onCropPointerDown}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerEnd}
                  onPointerCancel={onCropPointerEnd}
                  onPointerLeave={onCropPointerEnd}
                />
              </div>
              <div className="cleaner-crop-controls">
                <label className="cleaner-crop-zoom" htmlFor="signup-crop-zoom">
                  <span>{tS("cropModal.zoomLabel")}</span>
                  <input
                    id="signup-crop-zoom"
                    type="range"
                    min={PROFILE_CROP_MIN_ZOOM}
                    max={PROFILE_CROP_MAX_ZOOM}
                    step={0.01}
                    value={cropZoom}
                    onChange={(event) => setCropZoomLevel(Number(event.target.value))}
                  />
                  <strong>{cropZoom.toFixed(2)}x</strong>
                </label>
                <div className="cleaner-crop-actions cleaner-crop-actions--all">
                  <div className="cleaner-crop-actions-left">
                    <button className="secondary-link" type="button" onClick={() => setCropOffset({ x: 0, y: 0 })}>
                      {tS("cropModal.recenter")}
                    </button>
                    <button className="secondary-link" type="button" onClick={() => setCropZoomLevel(PROFILE_CROP_MIN_ZOOM)}>
                      {tS("cropModal.resetZoom")}
                    </button>
                  </div>
                  <div className="cleaner-crop-actions-right">
                    <button className="secondary-link" type="button" onClick={closeCropEditor}>
                      {tS("cropModal.cancel")}
                    </button>
                    <button className="primary-link auth-submit" type="button" onClick={applyCropResult} disabled={cropBusy}>
                      {cropBusy ? tS("cropModal.applying") : tS("cropModal.useImage")}
                    </button>
                  </div>
                </div>
              </div>
              {cropError ? <p className="form-error">{cropError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
      {showEmptyBioPrompt ? (
        <div className="signup-empty-bio-backdrop" role="dialog" aria-modal="true" aria-labelledby="empty-bio-title" aria-describedby="empty-bio-description">
          <div className="signup-empty-bio-modal">
            <h2 id="empty-bio-title">{tS("emptyBioPrompt.heading")}</h2>
            <p id="empty-bio-description">{tS("emptyBioPrompt.body")}</p>
            <div className="signup-empty-bio-footer">
              <div className="signup-empty-bio-icon" aria-hidden>
                <Sparkles size={24} />
              </div>
              <div className="signup-empty-bio-actions">
                <button type="button" className="primary-link auth-submit" onClick={returnToIntroduction}>
                  {tS("emptyBioPrompt.addBio")}
                </button>
                <button type="button" className="signup-empty-bio-text-action" onClick={createAccountWithoutBio} disabled={submitting}>
                  {submitting ? tS("emptyBioPrompt.loading") : tS("emptyBioPrompt.continueWithout")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showEmptyPhotoPrompt ? (
        <div className="signup-empty-bio-backdrop" role="dialog" aria-modal="true" aria-labelledby="empty-photo-title" aria-describedby="empty-photo-description">
          <div className="signup-empty-bio-modal">
            <h2 id="empty-photo-title">{tS("emptyPhotoPrompt.heading")}</h2>
            <p id="empty-photo-description">{tS("emptyPhotoPrompt.body")}</p>
            <div className="signup-empty-bio-footer">
              <div className="signup-empty-bio-icon" aria-hidden>
                <Sparkles size={24} />
              </div>
              <div className="signup-empty-bio-actions">
                <button type="button" className="primary-link auth-submit" onClick={openProfilePhotoPicker}>
                  {tS("emptyPhotoPrompt.upload")}
                </button>
                <button type="button" className="signup-empty-bio-text-action" onClick={createCleanerAccount} disabled={submitting}>
                  {submitting ? tS("emptyPhotoPrompt.creatingAccount") : tS("emptyPhotoPrompt.createWithout")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

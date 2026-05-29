"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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

type SignupRole = Extract<UserRole, "host" | "cleaner" | "agency">;
type SignupStep = "account" | "confirm_email" | "role" | "location" | "personal_info" | "native_language" | "experience" | "availability";
type SignupField = "first_name" | "last_name" | "email" | "password" | "password_confirm" | "form";
type SignupFieldErrors = Partial<Record<SignupField, string>>;
type PersonalInfoErrors = Partial<Record<"birth_date" | "sex", string>>;
type Direction = 1 | -1;
type WorkPreference = "full_time" | "part_time";
type PreferredTimeSlot = "morning" | "afternoon" | "evening" | "flexible";
type WeeklyTimeSlot = Exclude<PreferredTimeSlot, "flexible">;
type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type SignupDraft = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirm: string;
};

type CityConfig = {
  value: string;
  label: string;
  zones: string[];
};

const SOFIA_NEIGHBORHOODS = [
  "7-ми 11-ти километър",
  "Абдовица",
  "Банишора",
  "Белите брези",
  "Бенковски",
  "Борово",
  "Ботунец",
  "Ботунец 2",
  "Бояна",
  "Бъкстон",
  "Витоша",
  "Военна рампа",
  "Враждебна",
  "Връбница 1",
  "Връбница 2",
  "Гевгелийски",
  "Гео Милев",
  "Горна баня",
  "Горубляне",
  "Гоце Делчев",
  "Градина",
  "Дианабад",
  "Димитър Миленков",
  "Докторски паметник",
  "Драгалевци",
  "Дружба 1",
  "Дружба 2",
  "Дървеница",
  "Експериментален",
  "Западен парк",
  "Захарна фабрика",
  "Зона Б-18",
  "Зона Б-19",
  "Зона Б-5",
  "Зона Б-5-3",
  "Иван Вазов",
  "Изгрев",
  "Изток",
  "Илинден",
  "Илиянци",
  "Карпузица",
  "Княжево",
  "Красна поляна 1",
  "Красна поляна 2",
  "Красна поляна 3",
  "Красно село",
  "Кремиковци",
  "Кръстова вада",
  "Лагера",
  "Левски",
  "Левски В",
  "Левски Г",
  "Летище София",
  "Лозенец",
  "Люлин - център",
  "Люлин 1",
  "Люлин 10",
  "Люлин 2",
  "Люлин 3",
  "Люлин 4",
  "Люлин 5",
  "Люлин 6",
  "Люлин 7",
  "Люлин 8",
  "Люлин 9",
  "Малашевци",
  "Малинова долина",
  "Манастирски ливади",
  "Медицинска академия",
  "Младост 1",
  "Младост 1А",
  "Младост 2",
  "Младост 3",
  "Младост 4",
  "Модерно предградие",
  "Мусагеница",
  "Надежда 1",
  "Надежда 2",
  "Надежда 3",
  "Надежда 4",
  "НПЗ Изток",
  "НПЗ Искър",
  "НПЗ Средец",
  "НПЗ Хаджи Димитър",
  "Обеля",
  "Обеля 1",
  "Обеля 2",
  "Оборище",
  "Овча купел",
  "Овча купел 1",
  "Овча купел 2",
  "Орландовци",
  "Павлово",
  "ПЗ Илиянци",
  "ПЗ Хладилника",
  "Подуяне",
  "Полигона",
  "Разсадника",
  "Редута",
  "Република",
  "Република 2",
  "Света Троица",
  "Свобода",
  "Сердика",
  "Сеславци",
  "Симеоново",
  "Славия",
  "Слатина",
  "СПЗ Модерно предградие",
  "СПЗ Слатина",
  "Стрелбище",
  "Студентски град",
  "Сухата река",
  "Суходол",
  "Толстой",
  "Требич",
  "Триъгълника",
  "Факултета",
  "Филиповци",
  "Фондови жилища",
  "Хаджи Димитър",
  "Хиподрума",
  "Хладилника",
  "Христо Ботев",
  "Център",
  "Челопечене",
  "Яворов",
  "в.з.Американски колеж",
  "в.з.Беловодски път",
  "в.з.Бояна",
  "в.з.Бункера",
  "в.з.Врана - Герман",
  "в.з.Врана - Лозен",
  "в.з.Горна баня",
  "в.з.Килиите",
  "в.з.Киноцентъра",
  "в.з.Киноцентъра 3 част",
  "в.з.Люлин",
  "в.з.Малинова долина",
  "в.з.Малинова долина - Герена",
  "в.з.Симеоново - Драгалевци",
  "в.з.Черния кос",
  "гр. Банкя",
  "гр. Бухово",
  "гр. Нови Искър",
  "ж.гр.Зоопарк",
  "ж.гр.Южен парк",
  "м-т Барите",
  "м-т Батареята",
  "м-т Гърдова глава",
  "м-т Детски град",
  "м-т Камбаните",
  "м-т Киноцентъра",
  "м-т Мала кория",
  "м-т Подлозище",
  "м-т Щъркелово гнездо",
  "м-т Юбилейна гора",
  "м-т яз. Искър",
  "м-т Яладжа",
  "с. Балша",
  "с. Бистрица",
  "с. Бусманци",
  "с. Владая",
  "с. Войнеговци",
  "с. Волуяк",
  "с. Герман",
  "с. Горни Богров",
  "с. Доброславци",
  "с. Долни Богров",
  "с. Долни Пасарел",
  "с. Железница",
  "с. Желява",
  "с. Житен",
  "с. Иваняне",
  "с. Казичене",
  "с. Клисура",
  "с. Кокаляне",
  "с. Кривина",
  "с. Кубратово",
  "с. Кътина",
  "с. Лозен",
  "с. Локорско",
  "с. Мало Бучино",
  "с. Мировяне",
  "с. Мрамор",
  "с. Мърчаево",
  "с. Негован",
  "с. Панчарево",
  "с. Плана",
  "с. Подгумер",
  "с. Световрачене",
  "с. Чепинци",
  "с. Яна",
];

const PLOVDIV_NEIGHBORHOODS = [
  "Асеновградско шосе",
  "Беломорски",
  "Брезовско шосе",
  "Въстанически",
  "Гагарин",
  "Гладно поле",
  "Голямоконарско шосе",
  "Гуджуците",
  "Западен",
  "Западна дъга",
  "Захарна фабрика",
  "Изгрев",
  "Източна дъга",
  "Индустриална зона - Изгрев",
  "Индустриална зона - Изток",
  "Индустриална зона - Марица",
  "Индустриална зона - Север",
  "Индустриална зона - Тракия",
  "Индустриална зона - Юг",
  "Институт по овощарство",
  "Каменица 1",
  "Каменица 2",
  "Капана",
  "Карловско шосе",
  "Коматево",
  "Коматевски възел",
  "Коматевско шосе",
  "Кукленско шосе",
  "Кършияка",
  "Кючук Париж",
  "Мараша",
  "Младежки Хълм",
  "Остромила",
  "Отдих и култура",
  "Пазарджишко шосе",
  "Пещерско шосе",
  "Прослав",
  "Рогошко шосе",
  "Старият град",
  "Столипиново",
  "Сточна гара",
  "Съдийски",
  "Терзиите",
  "Тракия",
  "Филипово",
  "Христо Смирненски",
  "Цариградско шосе",
  "Централна гара",
  "Център",
  "Южен",
  "Южна дъга",
];

const VARNA_NEIGHBORHOODS = [
  "Автогара",
  "Аспарухово",
  "Базар Левски",
  "Бизнес парк Варна",
  "Бизнес хотел",
  "Бриз",
  "Виница",
  "ВИНС-Червен площад",
  "Владислав Варненчик 1",
  "Владислав Варненчик 2",
  "Възраждане 1",
  "Възраждане 2",
  "Възраждане 3",
  "Възраждане 4",
  "Галата",
  "Гранд Мол",
  "Гръцка махала",
  "Електроразпределение Варна",
  "ЖП Гара",
  "Завод Дружба",
  "Западна промишлена зона",
  "Зимно кино Тракия",
  "Изгрев",
  "Кайсиева градина",
  "Колхозен пазар",
  "Конфуто",
  "Левски 1",
  "Левски 2",
  "Летище",
  "Лятно кино Тракия",
  "Максуда",
  "Малка Чайка",
  "Метро",
  "Младост 1",
  "Младост 2",
  "Окръжна болница-Генерали",
  "Операта",
  "Островна промишлена зона",
  "Планова промишлена зона",
  "Победа",
  "Погреби",
  "Пристанище Варна",
  "Промишлена зона Тополи",
  "Свети Никола",
  "Северна промишлена зона",
  "Спортна зала",
  "Стадион Спартак",
  "Трошево",
  "Фестивален комплекс",
  "ХЕИ",
  "Христо Ботев",
  "Цветен квартал",
  "Централна поща",
  "Център",
  "Чайка",
  "Чаталджа",
  "в.з.Виница - север",
  "в.з.Звездица",
  "к.к. Златни пясъци",
  "к.к. Св.Св. Константин и Елена",
  "к.к. Слънчев ден",
  "к.к. Чайка",
  "м-т Акчелар",
  "м-т Ален мак",
  "м-т Атанас Тарла",
  "м-т Балам Дере",
  "м-т Боклук Тарла",
  "м-т Боровец - север",
  "м-т Боровец - юг",
  "м-т Горна Трака",
  "м-т Добрева чешма",
  "м-т Долна Трака",
  "м-т Евксиноград",
  "м-т Зеленика",
  "м-т Кантара",
  "м-т Кочмар",
  "м-т Крушките",
  "м-т Лазур",
  "м-т Манастирски рид",
  "м-т Ментешето",
  "м-т Орехчето",
  "м-т Перчемлията",
  "м-т Планова",
  "м-т Прибой",
  "м-т Припек",
  "м-т Пчелина",
  "м-т Ракитника",
  "м-т Салтанат",
  "м-т Сотира",
  "м-т Сълзица",
  "м-т Телевизионна кула",
  "м-т Фичоза",
  "м-т Франга Дере",
  "с. Звездица",
  "с. Казашко",
  "с. Каменар",
  "с. Константиново",
  "с. Тополи",
];

const cities: CityConfig[] = [
  { value: "sofia", label: "Sofia", zones: SOFIA_NEIGHBORHOODS },
  { value: "plovdiv", label: "Plovdiv", zones: PLOVDIV_NEIGHBORHOODS },
  { value: "varna", label: "Varna", zones: VARNA_NEIGHBORHOODS },
];

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
const workPreferenceOptions: Array<{ value: WorkPreference; label: string }> = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
];
const preferredTimeOptions: Array<{ value: PreferredTimeSlot; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "flexible", label: "Flexible" },
];
const weeklyTimeOptions: Array<{ value: WeeklyTimeSlot; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const weekdays: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

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

function emptyWeeklyAvailability(): Record<Weekday, WeeklyTimeSlot[]> {
  return weekdays.reduce((availability, day) => {
    availability[day.value] = [];
    return availability;
  }, {} as Record<Weekday, WeeklyTimeSlot[]>);
}

function normalizePreferredTimeSlots(value: unknown): PreferredTimeSlot[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(preferredTimeOptions.map((option) => option.value));
  const slots = value.filter((slot): slot is PreferredTimeSlot => typeof slot === "string" && allowed.has(slot as PreferredTimeSlot));
  return slots.includes("flexible") ? ["flexible"] : Array.from(new Set(slots));
}

function normalizeWeeklyAvailability(value: unknown): Record<Weekday, WeeklyTimeSlot[]> {
  const availability = emptyWeeklyAvailability();
  if (!value || typeof value !== "object" || Array.isArray(value)) return availability;
  const raw = value as Partial<Record<Weekday, unknown>>;
  const allowed = new Set(weeklyTimeOptions.map((option) => option.value));
  weekdays.forEach((day) => {
    const slots = raw[day.value];
    if (!Array.isArray(slots)) return;
    availability[day.value] = Array.from(new Set(slots.filter((slot): slot is WeeklyTimeSlot => typeof slot === "string" && allowed.has(slot as WeeklyTimeSlot))));
  });
  return availability;
}

function stepIndex(step: SignupStep, role: SignupRole | null) {
  const steps = role === "cleaner"
    ? ["role", "personal_info", "location", "native_language", "experience", "availability"]
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
  const [workPreference, setWorkPreference] = useState<WorkPreference | "">("");
  const [preferredTimeSlots, setPreferredTimeSlots] = useState<PreferredTimeSlot[]>([]);
  const [weeklyAvailability, setWeeklyAvailability] = useState<Record<Weekday, WeeklyTimeSlot[]>>(emptyWeeklyAvailability);
  const [customizeAvailability, setCustomizeAvailability] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [personalErrors, setPersonalErrors] = useState<PersonalInfoErrors>({});
  const [languageError, setLanguageError] = useState("");
  const [experienceError, setExperienceError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
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
          workPreference: WorkPreference;
          preferredTimeSlots: PreferredTimeSlot[];
          weeklyAvailability: Record<Weekday, WeeklyTimeSlot[]>;
          customizeAvailability: boolean;
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
        if (parsed.workPreference === "full_time" || parsed.workPreference === "part_time") setWorkPreference(parsed.workPreference);
        setPreferredTimeSlots(normalizePreferredTimeSlots(parsed.preferredTimeSlots));
        setWeeklyAvailability(normalizeWeeklyAvailability(parsed.weeklyAvailability));
        setCustomizeAvailability(Boolean(parsed.customizeAvailability));
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
      const storedWorkPreference = sessionStorage.getItem("signup_work_preference");
      if (storedWorkPreference === "full_time" || storedWorkPreference === "part_time") setWorkPreference(storedWorkPreference);
      const storedPreferredTimes = sessionStorage.getItem("signup_preferred_time_slots");
      if (storedPreferredTimes) {
        try {
          setPreferredTimeSlots(normalizePreferredTimeSlots(JSON.parse(storedPreferredTimes) as unknown));
        } catch {
          setPreferredTimeSlots([]);
        }
      }
      const storedWeeklyAvailability = sessionStorage.getItem("signup_weekly_availability");
      if (storedWeeklyAvailability) {
        try {
          setWeeklyAvailability(normalizeWeeklyAvailability(JSON.parse(storedWeeklyAvailability) as unknown));
        } catch {
          setWeeklyAvailability(emptyWeeklyAvailability());
        }
      }
      setCustomizeAvailability(sessionStorage.getItem("signup_customize_availability") === "true");
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
        workPreference,
        preferredTimeSlots,
        weeklyAvailability,
        customizeAvailability,
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
    if (workPreference) sessionStorage.setItem("signup_work_preference", workPreference);
    sessionStorage.setItem("signup_preferred_time_slots", JSON.stringify(preferredTimeSlots));
    sessionStorage.setItem("signup_weekly_availability", JSON.stringify(weeklyAvailability));
    sessionStorage.setItem("signup_customize_availability", String(customizeAvailability));
  }, [birthDate, city, confirmPassword, customizeAvailability, email, emailVerificationToken, experience, firstName, languageChoice, lastName, otherLanguage, password, preferredTimeSlots, restored, role, selectedZones, sex, step, weeklyAvailability, workPreference]);

  const selectedCity = useMemo(() => cities.find((item) => item.value === city) ?? null, [city]);
  const availableZones = useMemo(() => selectedCity?.zones.filter((zone) => !selectedZones.has(zone)) ?? [], [selectedCity, selectedZones]);
  const selectedZoneList = useMemo(() => selectedCity?.zones.filter((zone) => selectedZones.has(zone)) ?? [], [selectedCity, selectedZones]);
  const filteredAvailableZones = useMemo(() => {
    const query = districtSearch.trim().toLocaleLowerCase();
    if (!query) return availableZones;
    return availableZones.filter((zone) => zone.toLocaleLowerCase().includes(query));
  }, [availableZones, districtSearch]);
  const canContinueLocation = Boolean(selectedCity && selectedZones.size > 0);
  const totalSteps = role === "cleaner" ? 6 : 2;
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
      "signup_work_preference",
      "signup_preferred_time_slots",
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

  function togglePreferredTimeSlot(slot: PreferredTimeSlot) {
    setAvailabilityError("");
    setPreferredTimeSlots((current) => {
      if (slot === "flexible") return current.includes("flexible") ? [] : ["flexible"];
      const withoutFlexible = current.filter((item) => item !== "flexible");
      if (withoutFlexible.includes(slot)) return withoutFlexible.filter((item) => item !== slot);
      return [...withoutFlexible, slot];
    });
  }

  function toggleWeeklySlot(day: Weekday, slot: WeeklyTimeSlot) {
    setWeeklyAvailability((current) => {
      const daySlots = current[day] ?? [];
      const nextDaySlots = daySlots.includes(slot) ? daySlots.filter((item) => item !== slot) : [...daySlots, slot];
      return { ...current, [day]: nextDaySlots };
    });
  }

  function selectedWeeklyAvailability() {
    return weekdays.reduce((availability, day) => {
      const slots = weeklyAvailability[day.value] ?? [];
      if (slots.length > 0) availability[day.value] = slots;
      return availability;
    }, {} as Partial<Record<Weekday, WeeklyTimeSlot[]>>);
  }

  function submitAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || role !== "cleaner" || !selectedCity || !emailVerificationToken) return;
    if (!workPreference) {
      setAvailabilityError("Choose how you prefer to work.");
      return;
    }
    if (preferredTimeSlots.length === 0) {
      setAvailabilityError("Choose at least one preferred time.");
      return;
    }
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
      work_preference: workPreference,
      preferred_time_slots: preferredTimeSlots,
      weekly_availability: customizeAvailability ? selectedWeeklyAvailability() : {},
    });
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

    return (
      <>
        <div className="auth-heading">
          <h1>How do you prefer to work?</h1>
        </div>
        <form className="auth-form signup-availability-form" onSubmit={submitAvailability} noValidate>
          <section className="signup-availability-section" aria-labelledby="work-preference-title">
            <h2 id="work-preference-title">Work preference</h2>
            <div className="signup-availability-choice-grid" role="radiogroup" aria-label="Work preference">
              {workPreferenceOptions.map((option) => {
                const selected = workPreference === option.value;
                return (
                  <button type="button" key={option.value} className={selected ? "signup-experience-option selected" : "signup-experience-option"} role="radio" aria-checked={selected} onClick={() => { setWorkPreference(option.value); setAvailabilityError(""); }}>
                    <span>{option.label}</span>
                    {selected ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="signup-availability-section" aria-labelledby="preferred-times-title">
            <h2 id="preferred-times-title">Preferred times</h2>
            <div className="signup-availability-choice-grid signup-availability-time-grid" aria-label="Preferred times">
              {preferredTimeOptions.map((option) => {
                const selected = preferredTimeSlots.includes(option.value);
                return (
                  <button type="button" key={option.value} className={selected ? "signup-experience-option selected" : "signup-experience-option"} aria-pressed={selected} onClick={() => togglePreferredTimeSlot(option.value)}>
                    <span>{option.label}</span>
                    {selected ? <span className="signup-experience-check" aria-hidden><Check size={15} /></span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="signup-availability-section">
            <button type="button" className="secondary-link signup-availability-toggle" onClick={() => setCustomizeAvailability((open) => !open)} aria-expanded={customizeAvailability}>
              {customizeAvailability ? "Hide days" : "Customize days"}
              <ChevronDown size={17} aria-hidden />
            </button>
            {customizeAvailability ? (
              <div className="signup-weekly-grid" aria-label="Weekly availability">
                <div className="signup-weekly-row signup-weekly-head" aria-hidden>
                  <span />
                  {weeklyTimeOptions.map((slot) => <span key={slot.value}>{slot.label}</span>)}
                </div>
                {weekdays.map((day) => (
                  <div className="signup-weekly-row" key={day.value}>
                    <strong>{day.label}</strong>
                    {weeklyTimeOptions.map((slot) => {
                      const selected = weeklyAvailability[day.value]?.includes(slot.value) ?? false;
                      return (
                        <button type="button" key={slot.value} className={selected ? "signup-weekly-slot selected" : "signup-weekly-slot"} aria-pressed={selected} aria-label={`${day.label} ${slot.label}`} onClick={() => toggleWeeklySlot(day.value, slot.value)}>
                          {selected ? <Check size={16} aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {availabilityError ? <p className="form-error">{availabilityError}</p> : null}
          {submitError ? <p className="form-error">{submitError}</p> : null}
          <div className="signup-nav-actions">
            <button type="button" className="secondary-link" onClick={() => goTo("experience", -1)}><ChevronLeft size={16} aria-hidden />Back</button>
            <button className="primary-link auth-submit" type="submit" disabled={!workPreference || preferredTimeSlots.length === 0 || submitting}>{submitting ? "Creating account" : "Create account"}</button>
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
        <div className="signup-wizard-frame">
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
    </main>
  );
}

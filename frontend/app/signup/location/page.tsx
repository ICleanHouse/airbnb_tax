"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { apiFetch } from "../../../lib/api";

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

export default function SignupLocationPage() {
  const [city, setCity] = useState<string>("");
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [availableChoice, setAvailableChoice] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [draggedZone, setDraggedZone] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<"available" | "selected" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [signupRole, setSignupRole] = useState("");

  useEffect(() => {
    const rawDraft = sessionStorage.getItem("signup_draft");
    const rawRole = sessionStorage.getItem("signup_role");
    const emailVerificationToken = sessionStorage.getItem("signup_email_verification_token");
    if (!rawDraft || !rawRole || !emailVerificationToken) {
      window.location.href = "/signup";
      return;
    }
    setSignupRole(rawRole);

    const storedCity = sessionStorage.getItem("signup_city") ?? "";
    const validCity = cities.some((item) => item.value === storedCity) ? storedCity : "";
    setCity(validCity);

    const initialZones = asSet(sessionStorage.getItem("signup_zones"));
    if (!validCity) {
      setSelectedZones(new Set());
      return;
    }

    const cityZones = new Set(cities.find((item) => item.value === validCity)?.zones ?? []);
    const sanitized = new Set(Array.from(initialZones).filter((zone) => cityZones.has(zone)));
    setSelectedZones(sanitized);
  }, []);

  const selectedCity = useMemo(() => cities.find((item) => item.value === city) ?? null, [city]);
  const availableZones = useMemo(
    () => selectedCity?.zones.filter((zone) => !selectedZones.has(zone)) ?? [],
    [selectedCity, selectedZones],
  );
  const selectedZoneList = useMemo(
    () => selectedCity?.zones.filter((zone) => selectedZones.has(zone)) ?? [],
    [selectedCity, selectedZones],
  );
  const filteredAvailableZones = useMemo(() => {
    const query = districtSearch.trim().toLocaleLowerCase();
    if (!query) return availableZones;
    return availableZones.filter((zone) => zone.toLocaleLowerCase().includes(query));
  }, [availableZones, districtSearch]);
  const canContinue = Boolean(selectedCity && selectedZones.size > 0);

  function addNeighborhood() {
    if (!selectedCity || !availableChoice) return;
    setSelectedZones((prev) => {
      const next = new Set(prev);
      next.add(availableChoice);
      return next;
    });
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
    if (!selectedCity) return;
    setSelectedZones(new Set(selectedCity.zones));
  }

  function clearZones() {
    setSelectedZones(new Set());
  }

  function addSpecificNeighborhood(zone: string) {
    if (!selectedCity) return;
    setSelectedZones((prev) => {
      const next = new Set(prev);
      next.add(zone);
      return next;
    });
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

  async function continueToNextStep() {
    if (!canContinue || !selectedCity) return;
    const rawDraft = sessionStorage.getItem("signup_draft");
    const rawRole = sessionStorage.getItem("signup_role");
    const emailVerificationToken = sessionStorage.getItem("signup_email_verification_token");
    if (!rawDraft || !rawRole || !emailVerificationToken) {
      window.location.href = "/signup";
      return;
    }

    sessionStorage.setItem("signup_city", selectedCity.value);
    sessionStorage.setItem("signup_city_label", selectedCity.label);
    sessionStorage.setItem("signup_zones", JSON.stringify(Array.from(selectedZones)));
    if (rawRole === "cleaner") {
      window.location.href = "/signup/personal-info";
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const draft = JSON.parse(rawDraft) as Record<string, unknown>;
      const response = await apiFetch("/api/accounts/signup/", {
        method: "POST",
        body: JSON.stringify({
          first_name: draft.first_name,
          last_name: draft.last_name,
          email: draft.email,
          password: draft.password,
          password_confirm: draft.password_confirm,
          role: rawRole,
          email_verification_token: emailVerificationToken,
          city: selectedCity.label,
          service_areas: Array.from(selectedZones),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : "";
        setSubmitError(detail || "Could not create the account. Check your details and try again.");
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
      setSubmitError("Could not create the account. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth-panel signup-auth-panel signup-location-step">
        <Link className="site-brand auth-brand" href="/">
          <span className="brand-symbol">
            <UserPlus size={18} aria-hidden />
          </span>
          <strong>Host Cleaners</strong>
        </Link>

        <div className="signup-progress-wrap" aria-label="Signup progress">
          <div className="signup-progress-meta">
            <strong>{signupRole === "cleaner" ? "Step 4 of 5" : "Step 4 of 4"}</strong>
            <span>{signupRole === "cleaner" ? "80% complete" : "100% complete"}</span>
          </div>
          <div className="signup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={signupRole === "cleaner" ? 80 : 100}>
            <div className={signupRole === "cleaner" ? "signup-progress-fill signup-progress-fill-step-4-of-5" : "signup-progress-fill signup-progress-fill-step-4"} />
          </div>
        </div>

        <div className="auth-heading">
          <h1>Select your city and area</h1>
        </div>

        <label className="signup-city-picker">
          <span>City</span>
          <select
            value={city}
            onChange={(event) => {
              const nextCity = event.target.value;
              setCity(nextCity);
              setSelectedZones(new Set());
              setAvailableChoice("");
              setSelectedChoice("");
              setDistrictSearch("");
            }}
          >
            <option value="">Choose city</option>
            {cities.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
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
                <div
                  className="dual-zone-listbox"
                  role="listbox"
                  aria-label="List of Districts"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDropToAvailable}
                >
                  <div className="dual-zone-listbox-search-wrap">
                    <input
                      className="dual-zone-search"
                      type="text"
                      placeholder="Search district"
                      value={districtSearch}
                      onChange={(event) => setDistrictSearch(event.target.value)}
                    />
                  </div>
                  <div className="dual-zone-items">
                    {filteredAvailableZones.map((zone) => (
                      <button
                        type="button"
                        key={zone}
                        className={availableChoice === zone ? "dual-zone-item selected" : "dual-zone-item"}
                        onClick={() => setAvailableChoice(zone)}
                        onDoubleClick={() => addSpecificNeighborhood(zone)}
                        draggable
                        onDragStart={() => {
                          setDraggedZone(zone);
                          setDragSource("available");
                        }}
                        onDragEnd={() => {
                          setDraggedZone(null);
                          setDragSource(null);
                        }}
                      >
                        {zone}
                      </button>
                    ))}
                  </div>
                </div>
              </label>

              <div className="dual-zone-controls">
                <button type="button" onClick={addNeighborhood} disabled={!availableChoice} aria-label="Add neighborhood">
                  ▶
                </button>
                <button type="button" onClick={removeNeighborhood} disabled={!selectedChoice} aria-label="Remove neighborhood">
                  ◀
                </button>
              </div>

              <label className="dual-zone-list">
                <span>Selected Districts:</span>
                <div
                  className="dual-zone-listbox"
                  role="listbox"
                  aria-label="Selected Districts"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDropToSelected}
                >
                  <div className="dual-zone-items">
                    {selectedZoneList.map((zone) => (
                      <button
                        type="button"
                        key={zone}
                        className={selectedChoice === zone ? "dual-zone-item selected" : "dual-zone-item"}
                        onClick={() => setSelectedChoice(zone)}
                        onDoubleClick={() => removeSpecificNeighborhood(zone)}
                        draggable
                        onDragStart={() => {
                          setDraggedZone(zone);
                          setDragSource("selected");
                        }}
                        onDragEnd={() => {
                          setDraggedZone(null);
                          setDragSource(null);
                        }}
                      >
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
        <button className="primary-link auth-submit" type="button" disabled={!canContinue || submitting} onClick={continueToNextStep}>
          {submitting ? "Creating account" : signupRole === "cleaner" ? "Continue" : "Create account"}
        </button>
      </section>
    </main>
  );
}

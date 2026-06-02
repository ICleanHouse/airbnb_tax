/**
 * Bulgarian cities with their administrative districts and popular neighbourhoods.
 *
 * Shape used throughout the app:
 *   cities.find(c => c.value === cityValue)
 *   cities.flatMap(c => c.zones)        ← ALL_DISTRICTS set
 *   city.zones                          ← district picker options
 *
 * Zone names are in Bulgarian (Cyrillic) to match how residents know them.
 * City `value` is lowercase ASCII for stable DB storage.
 */

export interface City {
  value: string;
  label: string;
  zones: string[];
}

export const cities: City[] = [
  {
    value: "sofia",
    label: "Sofia",
    zones: [
      // Administrative regions
      "Средец",
      "Оборище",
      "Изгрев",
      "Лозенец",
      "Триадица",
      "Красно село",
      "Витоша",
      "Овча купел",
      "Люлин",
      "Красна поляна",
      "Илинден",
      "Надежда",
      "Сердика",
      "Подуяне",
      "Слатина",
      "Студентски",
      "Младост",
      "Дружба",
      "Искър",
      "Нови Искър",
      "Кремиковци",
      "Панчарево",
      "Банкя",
      // Popular neighbourhoods
      "Бояна",
      "Симеоново",
      "Бъкстон",
      "Стрелбище",
      "Гоце Делчев",
      "Хладилника",
      "Борово",
      "Иван Вазов",
      "Яворов",
      "Докторски паметник",
      "Мусагеница",
      "Дианабад",
      "Дървеница",
      "Горна баня",
      "Суха река",
    ],
  },
  {
    value: "plovdiv",
    label: "Plovdiv",
    zones: [
      // Administrative regions
      "Централен",
      "Западен",
      "Северен",
      "Южен",
      "Тракия",
      // Popular neighbourhoods
      "Каменица",
      "Кючук Париж",
      "Столипиново",
      "Беломорски",
      "Смирненски",
      "Остромила",
      "Коматево",
      "Прослав",
      "Шекер махала",
      "Кършияка",
      "Христо Смирненски",
      "Гагарин",
      "Мараша",
      "Съдийски",
    ],
  },
  {
    value: "varna",
    label: "Varna",
    zones: [
      // Administrative regions
      "Одесос",
      "Приморски",
      "Владислав Варненчик",
      "Аспарухово",
      "Младост",
      // Popular neighbourhoods
      "Чайка",
      "Бриз",
      "Изгрев",
      "Победа",
      "Боровец",
      "Левски",
      "Трошево",
      "Колхозен пазар",
      "Гръцка махала",
      "Акациите",
      "Виница",
      "Галата",
      "Евксиноград",
    ],
  },
  {
    value: "burgas",
    label: "Burgas",
    zones: [
      // Administrative regions
      "Освобождение",
      "Лазур",
      "Меден рудник",
      "Зорница",
      "Изток",
      // Popular neighbourhoods / villages
      "Победа",
      "Братово",
      "Сарафово",
      "Долно Езерово",
      "Горно Езерово",
      "Ветрен",
      "Банево",
      "Черно море",
    ],
  },
  {
    value: "stara_zagora",
    label: "Stara Zagora",
    zones: [
      "Център",
      "Аязмото",
      "Три чучура",
      "Железник",
      "Опълченски",
      "Казански",
      "Зора",
      "Самара",
      "Кольо Ганчев",
      "Индустриален",
    ],
  },
  {
    value: "ruse",
    label: "Ruse",
    zones: [
      "Център",
      "Дружба",
      "Здравец",
      "Чародейка",
      "Средна кула",
      "Ялта",
      "Тракия",
      "Родина",
      "Цветница",
      "Възраждане",
      "Образцов чифлик",
    ],
  },
  {
    value: "pleven",
    label: "Pleven",
    zones: [
      "Център",
      "Сторгозия",
      "Дружба",
      "Идеален център",
      "Кайлъка",
      "Мара Денчева",
      "Ясен",
      "Бохемия",
    ],
  },
  {
    value: "sliven",
    label: "Sliven",
    zones: [
      "Център",
      "Надежда",
      "Клуцохор",
      "Дружба",
      "Младост",
      "Речица",
      "Индустриален",
    ],
  },
  {
    value: "dobrich",
    label: "Dobrich",
    zones: [
      "Център",
      "Дружба",
      "Русия",
      "Строител",
      "Балик",
      "Рилски",
      "Нова Добруджа",
    ],
  },
  {
    value: "shumen",
    label: "Shumen",
    zones: [
      "Център",
      "Дивдядово",
      "Мадара",
      "Тракия",
      "Колелото",
      "Ипподрума",
    ],
  },
  {
    value: "blagoevgrad",
    label: "Blagoevgrad",
    zones: [
      "Център",
      "Струмско",
      "Еленово",
      "Вароша",
      "Грамада",
      "Ален мак",
    ],
  },
  {
    value: "gabrovo",
    label: "Gabrovo",
    zones: [
      "Център",
      "Кметовци",
      "Борово",
      "Иванили",
      "Трендафил",
    ],
  },
  {
    value: "haskovo",
    label: "Haskovo",
    zones: [
      "Център",
      "Орфей",
      "Кенана",
      "Болярово",
      "Дружба",
      "Куба",
    ],
  },
  {
    value: "yambol",
    label: "Yambol",
    zones: [
      "Център",
      "Граф Игнатиево",
      "Диана",
      "Златен рог",
      "Бенковски",
    ],
  },
  {
    value: "pazardzhik",
    label: "Pazardzhik",
    zones: [
      "Център",
      "Иван Вазов",
      "Ниша",
      "Пазара",
      "Просвета",
    ],
  },
  {
    value: "kyustendil",
    label: "Kyustendil",
    zones: [
      "Център",
      "Изток",
      "Запад",
      "Север",
      "Юг",
    ],
  },
  {
    value: "pernik",
    label: "Pernik",
    zones: [
      "Център",
      "Тева",
      "Изток",
      "Запад",
      "Рудничар",
      "Дивотино",
    ],
  },
  {
    value: "targovishte",
    label: "Targovishte",
    zones: [
      "Център",
      "Малък Преслав",
      "Въстаническа",
      "Дружба",
    ],
  },
  {
    value: "vidin",
    label: "Vidin",
    zones: [
      "Център",
      "Бонония",
      "Вида",
      "Калето",
      "Крум",
    ],
  },
  {
    value: "vratsa",
    label: "Vratsa",
    zones: [
      "Център",
      "Дъбника",
      "Кулата",
      "Металург",
      "Нова Враца",
    ],
  },
  {
    value: "lovech",
    label: "Lovech",
    zones: [
      "Център",
      "Баховица",
      "Здравец",
      "Наречен",
    ],
  },
  {
    value: "montana",
    label: "Montana",
    zones: [
      "Център",
      "Заря",
      "Кутловица",
      "Младост",
    ],
  },
  {
    value: "kardzhali",
    label: "Kardzhali",
    zones: [
      "Център",
      "Арда",
      "Байкал",
      "Веселчане",
      "Гледка",
      "Студен кладенец",
    ],
  },
  {
    value: "razgrad",
    label: "Razgrad",
    zones: [
      "Център",
      "Орел",
      "Освобождение",
      "Добруджа",
    ],
  },
  {
    value: "silistra",
    label: "Silistra",
    zones: [
      "Център",
      "Алипиево",
      "Калипетрово",
      "Лозенец",
    ],
  },
  {
    value: "veliko_tarnovo",
    label: "Veliko Tarnovo",
    zones: [
      "Центъра",
      "Картала",
      "Колю Фичето",
      "Акация",
      "Бузлуджа",
      "Варуша",
      "Света гора",
    ],
  },
];

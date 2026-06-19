// Shared sample data + tiny helpers for the Host Cleaners UI kit.
function initials(name) {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p[1]?.[0] ?? "")).toUpperCase() : "?";
}

const CLEANERS = [
  {
    id: 1, cover: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80", name: "Maria Dimitrova", kind: "agency", rating: 4.9, jobs: 32,
    areas: ["Lozenets", "Oborishte", "Centre"], city: "Sofia", exp: "5+ years",
    languages: "Bulgarian, English, Russian", car: true,
    bio: "Sparkle Turnovers — a small Sofia agency specialising in same-day Airbnb turnovers. We bring our own supplies and send before/after photos on every clean.",
    reviews: [
      { id: 1, by: "Ivan P.", rating: 5, date: "May 2026", text: "Flawless turnover between two back-to-back guests. Photos sent within the hour." },
      { id: 2, by: "Elena T.", rating: 5, date: "Apr 2026", text: "Reliable and communicative. My go-to for the Lozenets flat." },
    ],
  },
  {
    id: 2, cover: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80", name: "Georgi Petrov", kind: "cleaner", rating: 4.7, jobs: 18,
    areas: ["Mladost", "Studentski"], city: "Sofia", exp: "3 years",
    languages: "Bulgarian, English", car: true,
    bio: "Detail-focused independent cleaner. Flexible on tight check-in windows and happy to handle linen changes.",
    reviews: [
      { id: 1, by: "Nadia K.", rating: 5, date: "May 2026", text: "On time, thorough, great with last-minute bookings." },
    ],
  },
  {
    id: 3, cover: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80", name: "Yana Stoyanova", kind: "cleaner", rating: 5.0, jobs: 41,
    areas: ["Sea Garden", "Centre"], city: "Varna", exp: "5+ years",
    languages: "Bulgarian, English, German", car: false,
    bio: "Varna-based turnover specialist for seaside apartments. Calm, fast, and meticulous about kitchen and bathroom detail.",
    reviews: [
      { id: 1, by: "Dimitar V.", rating: 5, date: "May 2026", text: "Best cleaner I've worked with all season. Guests keep mentioning how spotless the flat is." },
      { id: 2, by: "Sofia M.", rating: 5, date: "Mar 2026", text: "Absolutely dependable through the busy months." },
    ],
  },
  {
    id: 4, cover: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80", name: "Plamen Iliev", kind: "cleaner", rating: 4.5, jobs: 9,
    areas: ["Kamenitza", "Centre"], city: "Plovdiv", exp: "2 years",
    languages: "Bulgarian", car: true,
    bio: "Plovdiv old-town turnovers. Friendly, punctual, and good with the steep stairwells nobody else wants.",
    reviews: [
      { id: 1, by: "Rosen A.", rating: 4, date: "Apr 2026", text: "Solid work and easy to reach." },
    ],
  },
  {
    id: 5, cover: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80", name: "Desislava Koleva", kind: "cleaner", rating: 0, jobs: 0,
    areas: ["Bansko Centre"], city: "Bansko", exp: "1 year",
    languages: "Bulgarian, English", car: true,
    bio: "New to the platform — ski-season turnover cleaner in Bansko. Available on short notice through the winter.",
    reviews: [],
  },
  {
    id: 6, cover: "https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&w=900&q=80", name: "CleanCoast Agency", kind: "agency", rating: 4.8, jobs: 27,
    areas: ["Sea Garden", "Asparuhovo"], city: "Burgas", exp: "5+ years",
    languages: "Bulgarian, English", car: true,
    bio: "Burgas coastal agency covering multiple properties per day. Linen service and consumables restocking available as add-ons.",
    reviews: [
      { id: 1, by: "Petya G.", rating: 5, date: "May 2026", text: "Handled five of our flats through peak week without a single slip." },
    ],
  },
];

const CITIES = ["Sofia", "Plovdiv", "Varna", "Burgas", "Bansko"];

const HOST_JOBS = [
  { id: 1, title: "Turnover cleaning", property: "Lozenets Studio", city: "Sofia", date: "Sat 7 Jun", time: "11:00 – 14:00", price: "€55", status: "assigned", cleaner: "Maria Dimitrova" },
  { id: 2, title: "Deep clean + linen", property: "Sea Garden Apt", city: "Varna", date: "Sun 8 Jun", time: "10:00 – 13:30", price: "€70", status: "open", applicants: 4 },
  { id: 3, title: "Turnover cleaning", property: "Old Town Loft", city: "Plovdiv", date: "Mon 9 Jun", time: "12:00 – 14:00", price: "€45", status: "open", applicants: 2 },
  { id: 4, title: "Turnover cleaning", property: "Lozenets Studio", city: "Sofia", date: "Tue 3 Jun", time: "11:00 – 14:00", price: "€55", status: "completed", cleaner: "Maria Dimitrova" },
  { id: 5, title: "Checkout clean", property: "Mladost 2BR", city: "Sofia", date: "Wed 4 Jun", time: "11:00 – 13:00", price: "€48", status: "completed", cleaner: "Georgi Petrov" },
];

window.KIT = { initials, CLEANERS, CITIES, HOST_JOBS };

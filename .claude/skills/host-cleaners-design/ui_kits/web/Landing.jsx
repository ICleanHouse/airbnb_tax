// Public landing: header, hero, and the reputation-first cleaner browser.
const { useState: useStateBrowser, useMemo } = React;

function SiteHeader({ onLogin }) {
  return (
    <header className="site-header">
      <a className="site-brand" href="#"><BrandMark /></a>
      <div className="header-actions">
        <button className="btn-text" onClick={onLogin}>Log in</button>
        <button className="btn btn-primary" onClick={onLogin} style={{ minHeight: 40, padding: "0 16px", fontSize: 14 }}>Sign up</button>
        <button className="lang">EN</button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-media" aria-hidden></div>
      <div className="hero-content">
        <p className="eyebrow">Short-term rental turnover cleaning</p>
        <h1>Find a verified cleaner near you</h1>
        <p className="hero-copy">Browse trusted cleaners across Bulgaria. Filter by city and district, then open a profile to see ratings and reviews.</p>
      </div>
    </section>
  );
}

function CleanerCard({ cleaner, onOpen }) {
  const areas = cleaner.areas.slice(0, 2).join(", ");
  return (
    <button className="listing-card" onClick={() => onOpen(cleaner)}>
      <div className="listing-cover">
        <img src={cleaner.cover} alt="" loading="lazy" />
        {cleaner.kind === "agency" && <span className="listing-badge">Agency</span>}
      </div>
      <div className="listing-body">
        <div className="listing-row">
          <span className="listing-name">{cleaner.name}</span>
          {cleaner.rating > 0 && (
            <span className="listing-rating"><span className="listing-star">★</span>{cleaner.rating.toFixed(1)}</span>
          )}
        </div>
        <span className="listing-meta">{cleaner.city}{areas ? ` · ${areas}` : ""}</span>
        <span className="listing-sub">{cleaner.jobs > 0 ? `${cleaner.jobs} jobs · ${cleaner.exp}` : `New · ${cleaner.exp}`}</span>
      </div>
    </button>
  );
}

function CleanerBrowser({ onOpen }) {
  const [city, setCity] = useStateBrowser("");
  const cleaners = window.KIT.CLEANERS;
  const filtered = useMemo(
    () => (city ? cleaners.filter((c) => c.city === city) : cleaners),
    [city]
  );
  return (
    <div className="cleaner-browser">
      <div className="browser-head">
        <div>
          <h2 className="browser-title">Cleaners {city ? `in ${city}` : "across Bulgaria"}</h2>
          <span className="cb-count">{`${filtered.length} ${filtered.length === 1 ? "cleaner" : "cleaners"} available`}</span>
        </div>
        <div className="cleaner-browser-filters">
          <label className="cb-field">
            <span>City</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {window.KIT.CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="cb-field">
            <span>District</span>
            <select disabled={!city}>
              <option>{city ? "All districts" : "Any"}</option>
            </select>
          </label>
          {city && <button className="cb-clear" onClick={() => setCity("")}>Clear</button>}
        </div>
      </div>
      <div className="cleaners-grid">
        {filtered.map((c) => <CleanerCard key={c.id} cleaner={c} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

Object.assign(window, { SiteHeader, Hero, CleanerCard, CleanerBrowser });

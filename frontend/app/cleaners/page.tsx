"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, SlidersHorizontal } from "lucide-react";
import { apiFetch, type CurrentUser, type PublicCleaner } from "../../lib/api";
import CleanerProfileCard from "../components/CleanerProfileCard";
import CleanerProfileModal from "../components/CleanerProfileModal";

export default function CleanersDirectoryPage() {
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [cleaners, setCleaners] = useState<PublicCleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [area, setArea] = useState("");
  const [minRating, setMinRating] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/accounts/me/")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CurrentUser | null) => setMe(d))
      .finally(() => setLoadingMe(false));
  }, []);

  async function loadCleaners() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (area.trim()) params.set("service_area", area.trim());
    if (minRating) params.set("min_rating", minRating);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    const res = await apiFetch(`/api/accounts/public-cleaners/${qs ? `?${qs}` : ""}`);
    if (res.ok) {
      const d: unknown = await res.json();
      setCleaners(
        Array.isArray(d) ? (d as PublicCleaner[]) : ((d as { results: PublicCleaner[] }).results ?? []),
      );
    } else {
      setError("Could not load cleaners.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (me && (me.role === "host" || me.is_platform_admin)) void loadCleaners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const canView = useMemo(
    () => !!me && (me.role === "host" || me.is_platform_admin),
    [me],
  );

  if (loadingMe) {
    return <main className="host-page"><p className="host-loading">Loading…</p></main>;
  }

  if (!canView) {
    return (
      <main className="host-page">
        <section className="admin-gate">
          <p className="eyebrow">Hosts only</p>
          <h1>The cleaner directory is available to hosts.</h1>
          <Link className="primary-link" href="/login">Go to login</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="host-topbar">
        <Link className="site-brand" href="/host">
          <span className="brand-symbol"><ChevronLeft size={18} aria-hidden /></span>
          <strong>Find a cleaner</strong>
        </Link>
        <div className="host-topbar-right">
          <Link className="text-link" href="/host">Dashboard</Link>
        </div>
      </header>

      <main className="host-page cleaners-directory">
        <form
          className="cleaners-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void loadCleaners();
          }}
        >
          <div className="cleaners-filter-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by name or keyword"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="cleaners-filter-field">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Service area (e.g. Sofia)"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
          <select value={minRating} onChange={(e) => setMinRating(e.target.value)}>
            <option value="">Any rating</option>
            <option value="3">3★ & up</option>
            <option value="4">4★ & up</option>
            <option value="4.5">4.5★ & up</option>
          </select>
          <button type="submit" className="host-publish-btn">Search</button>
        </form>

        {loading ? (
          <div className="cleaners-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div className="cleaner-card-skeleton" key={n} />
            ))}
          </div>
        ) : error ? (
          <div className="host-empty-state">{error}</div>
        ) : cleaners.length === 0 ? (
          <div className="host-empty-state">No cleaners match your search yet.</div>
        ) : (
          <div className="cleaners-grid">
            {cleaners.map((cleaner) => (
              <CleanerProfileCard
                key={cleaner.id}
                cleaner={cleaner}
                onOpen={(c) => setOpenId(c.id)}
              />
            ))}
          </div>
        )}

        {openId !== null && (
          <CleanerProfileModal cleanerId={openId} onClose={() => setOpenId(null)} />
        )}
      </main>
    </>
  );
}

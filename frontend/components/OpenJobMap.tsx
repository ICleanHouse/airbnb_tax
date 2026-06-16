"use client";

import "leaflet/dist/leaflet.css";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { CurrentUser } from "../lib/api";

interface OpenJobLocation {
  id: number;
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  currency: string;
  proposed_price: string | null;
  property_name: string;
  property_city: string;
  property_neighborhood: string;
  property_address: string;
  property_image: string | null;
  host_name?: string;
  latitude: number;
  longitude: number;
}

interface Props {
  cityLabel: string;
  cityChangeSource: "select" | "map";
  currentUser: CurrentUser | null;
  onCityChange: (cityLabel: string) => void;
}

interface PopupOptions {
  canOfferWork: boolean;
  onOpenApplication: (job: OpenJobLocation) => void;
}

const CITY_CENTERS: Record<string, [number, number]> = {
  Sofia: [42.6977, 23.3219],
  Plovdiv: [42.1354, 24.7453],
  Varna: [43.2141, 27.9147],
};
const BULGARIA_CENTER: [number, number] = [42.7339, 25.4858];
const CITY_DETECTION_RADIUS_KM = 35;

const JOB_PIN_HTML = `
  <span class="open-job-pin-inner">
    <span class="open-job-pin-dot"></span>
  </span>
`;

function formatJobDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function appendLine(parent: HTMLElement, className: string, text: string) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
}

function messageFromResponse(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function createPopup(job: OpenJobLocation, options: PopupOptions) {
  const wrap = document.createElement("div");
  wrap.className = "open-job-popup";

  if (job.property_image) {
    const image = document.createElement("img");
    image.className = "open-job-popup-image";
    image.src = job.property_image;
    image.alt = job.property_name ? `${job.property_name} photo` : "Property photo";
    image.loading = "lazy";
    image.decoding = "async";
    wrap.appendChild(image);
  }

  appendLine(wrap, "open-job-popup-title", job.title || "Open cleaning job");
  appendLine(wrap, "open-job-popup-property", job.property_name || "Property");

  const addressParts = [
    job.property_address,
    job.property_neighborhood,
    job.property_city,
  ].filter(Boolean);
  if (addressParts.length) {
    appendLine(wrap, "open-job-popup-address", addressParts.join(", "));
  }

  const meta = [
    formatJobDate(job.scheduled_start),
    job.proposed_price ? `${job.proposed_price} ${job.currency}` : "",
  ].filter(Boolean);
  if (meta.length) {
    appendLine(wrap, "open-job-popup-meta", meta.join(" - "));
  }

  if (options.canOfferWork) {
    const actionWrap = document.createElement("div");
    actionWrap.className = "open-job-popup-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "open-job-popup-action";
    button.textContent = "Offer cleaning";

    button.addEventListener("click", () => {
      options.onOpenApplication(job);
    });

    actionWrap.appendChild(button);
    wrap.appendChild(actionWrap);
  }

  return wrap;
}

function readList<T>(data: T[] | { results?: T[] } | null): T[] {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

function distanceKm(a: { lat: number; lng: number }, b: [number, number]) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b[0] - a.lat);
  const dLng = toRadians(b[1] - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function cityFromMapCenter(center: { lat: number; lng: number }) {
  let nearest = "";
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [city, cityCenter] of Object.entries(CITY_CENTERS)) {
    const distance = distanceKm(center, cityCenter);
    if (distance < nearestDistance) {
      nearest = city;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= CITY_DETECTION_RADIUS_KM ? nearest : "";
}

export default function OpenJobMap({ cityLabel, cityChangeSource, currentUser, onCityChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const iconRef = useRef<any>(null);
  const userMovedMapRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const userAdjustedViewportRef = useRef(false);
  const cityLabelRef = useRef(cityLabel);
  const viewportFitCityLabelRef = useRef(cityLabel);
  const [jobs, setJobs] = useState<OpenJobLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyJob, setApplyJob] = useState<OpenJobLocation | null>(null);
  const [applyPrice, setApplyPrice] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applying, setApplying] = useState(false);

  const where = cityLabel || "Bulgaria";
  const canOfferWork = currentUser?.role === "cleaner";
  const center = useMemo<[number, number]>(
    () => CITY_CENTERS[cityLabel] ?? BULGARIA_CENTER,
    [cityLabel],
  );

  useEffect(() => {
    cityLabelRef.current = cityLabel;
  }, [cityLabel]);

  const openApplicationOverlay = useCallback((job: OpenJobLocation) => {
    setApplyJob(job);
    setApplyPrice(job.proposed_price ?? "");
    setApplyMessage("");
    setApplyError("");

    apiFetch(`/api/marketplace/jobs/${job.id}/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { host_name?: string } | null) => {
        if (!data?.host_name) return;
        setApplyJob((current) => (
          current?.id === job.id ? { ...current, host_name: data.host_name } : current
        ));
      })
      .catch(() => null);
  }, []);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!applyJob) return;
    setApplying(true);
    setApplyError("");

    try {
      const response = await apiFetch("/api/marketplace/applications/", {
        method: "POST",
        body: JSON.stringify({
          job_id: applyJob.id,
          proposed_price: applyPrice || null,
          message: applyMessage,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setApplyError(messageFromResponse(data, "Could not submit application."));
        return;
      }

      setApplyJob(null);
    } catch {
      setApplyError("Could not submit application.");
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = cityLabel ? `?city=${encodeURIComponent(cityLabel)}` : "";

    apiFetch(`/api/marketplace/open-job-locations/${query}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load job locations.");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setJobs(readList<OpenJobLocation>(data));
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([]);
          setError("Could not load the work map right now.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cityLabel]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || containerRef.current !== container) return;

      leafletRef.current = L;
      iconRef.current = L.divIcon({
        html: JOB_PIN_HTML,
        iconSize: [28, 34],
        iconAnchor: [14, 34],
        popupAnchor: [0, -30],
        className: "open-job-pin",
      });

      const map = L.map(container, { center, zoom: cityLabel ? 12 : 7 });
      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const markUserMove = () => {
        userMovedMapRef.current = true;
        userAdjustedViewportRef.current = true;
      };

      map.on("dragstart", markUserMove);
      map.on("zoomstart", markUserMove);
      map.on("moveend", () => {
        if (programmaticMoveRef.current) {
          programmaticMoveRef.current = false;
          userMovedMapRef.current = false;
          return;
        }
        if (!userMovedMapRef.current) return;
        userMovedMapRef.current = false;

        const nextCity = cityFromMapCenter(map.getCenter());
        if (nextCity !== cityLabelRef.current) onCityChange(nextCity);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
    // Map lifecycle is owned by Leaflet after mount; city/jobs updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const icon = iconRef.current;
    if (!L || !map || !markerLayer || !icon) return;

    markerLayer.clearLayers();

    const markers = jobs
      .filter((job) => Number.isFinite(job.latitude) && Number.isFinite(job.longitude))
      .map((job) =>
        L.marker([job.latitude, job.longitude], { icon })
          .bindPopup(createPopup(job, { canOfferWork, onOpenApplication: openApplicationOverlay }))
          .addTo(markerLayer),
      );

    window.setTimeout(() => map.invalidateSize(), 0);
    const markProgrammaticMove = () => {
      programmaticMoveRef.current = true;
      window.setTimeout(() => {
        programmaticMoveRef.current = false;
      }, 200);
    };

    const cityLabelChangedForViewport = viewportFitCityLabelRef.current !== cityLabel;
    viewportFitCityLabelRef.current = cityLabel;

    if (cityChangeSource === "select" && cityLabelChangedForViewport) {
      userAdjustedViewportRef.current = false;
    }

    const shouldKeepCurrentViewport = cityChangeSource === "map" || userAdjustedViewportRef.current;

    if (shouldKeepCurrentViewport) {
      return;
    }

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((marker: any) => marker.getLatLng()));
      markProgrammaticMove();
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14, animate: false });
    } else {
      markProgrammaticMove();
      map.setView(center, cityLabel ? 12 : 7, { animate: false });
    }
  }, [canOfferWork, center, cityChangeSource, cityLabel, jobs, openApplicationOverlay]);

  return (
    <>
      <section className="open-job-map-card" aria-label={`Open cleaning work map for ${where}`}>
        <div className="open-job-map-head">
          <div>
            <h2>Open host addresses in {where}</h2>
          </div>
          <span className="open-job-map-count">
            <Briefcase size={14} aria-hidden />
            {loading ? "Loading" : `${jobs.length} pin${jobs.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="open-job-map-shell">
          <div ref={containerRef} className="open-job-map" />
          {loading ? <div className="open-job-map-state">Loading map pins...</div> : null}
          {!loading && error ? <div className="open-job-map-state">{error}</div> : null}
        </div>
      </section>

      {applyJob ? (
        <div
          className="host-modal-backdrop open-job-apply-backdrop"
          onClick={() => setApplyJob(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Apply for job"
        >
          <div className="host-modal open-job-apply-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>Apply for job</h2>
              <button type="button" className="host-modal-close" onClick={() => setApplyJob(null)} aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>
            <form className="host-form" onSubmit={(event) => void submitApplication(event)}>
              <div className="open-job-apply-summary">
                {applyJob.property_image ? (
                  <Image
                    src={applyJob.property_image}
                    alt=""
                    width={300}
                    height={236}
                    unoptimized
                  />
                ) : null}
                <div className="open-job-apply-summary-body">
                  <strong>{applyJob.property_name || applyJob.title || "Property"}</strong>
                  <span>{applyJob.property_address || "Address not provided"}</span>
                  <span>{applyJob.host_name ? `Host: ${applyJob.host_name}` : "Host: loading..."}</span>
                  <span>{formatJobDate(applyJob.scheduled_start)}</span>
                </div>
              </div>

              <label>
                <span>Your price ({applyJob.currency || "EUR"})</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={applyPrice}
                  onChange={(event) => setApplyPrice(event.target.value)}
                  placeholder="45.00"
                />
              </label>
              <label>
                <span>Message to host</span>
                <textarea
                  rows={4}
                  value={applyMessage}
                  onChange={(event) => setApplyMessage(event.target.value)}
                  placeholder="Confirm availability, timing, and anything the host should know."
                />
              </label>

              {applyError ? <p className="form-error">{applyError}</p> : null}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setApplyJob(null)}>
                  Cancel
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={applying}>
                  {applying ? "Sending..." : "Submit application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

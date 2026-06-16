"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase } from "lucide-react";
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
  onOfferWork: (job: OpenJobLocation) => Promise<void>;
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

    const feedback = document.createElement("span");
    feedback.className = "open-job-popup-feedback";
    feedback.setAttribute("aria-live", "polite");

    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Sending...";
      feedback.textContent = "";

      void options.onOfferWork(job)
        .then(() => {
          button.textContent = "Work offered";
          feedback.textContent = "Sent to the host.";
        })
        .catch((error: unknown) => {
          button.disabled = false;
          button.textContent = "Offer my work";
          feedback.textContent = error instanceof Error ? error.message : "Could not send your offer.";
        });
    });

    actionWrap.appendChild(button);
    actionWrap.appendChild(feedback);
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

  const where = cityLabel || "Bulgaria";
  const canOfferWork = currentUser?.role === "cleaner";
  const center = useMemo<[number, number]>(
    () => CITY_CENTERS[cityLabel] ?? BULGARIA_CENTER,
    [cityLabel],
  );

  useEffect(() => {
    cityLabelRef.current = cityLabel;
  }, [cityLabel]);

  const offerWork = useCallback(async (job: OpenJobLocation) => {
    const response = await apiFetch("/api/marketplace/applications/", {
      method: "POST",
      body: JSON.stringify({
        job_id: job.id,
        proposed_price: null,
        message: "I am available for this job.",
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(messageFromResponse(data, "Could not send your offer."));
    }
  }, []);

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
          .bindPopup(createPopup(job, { canOfferWork, onOfferWork: offerWork }))
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
  }, [canOfferWork, center, cityChangeSource, cityLabel, jobs, offerWork]);

  return (
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
  );
}

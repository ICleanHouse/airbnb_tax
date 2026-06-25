"use client";

import "leaflet/dist/leaflet.css";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { CurrentUser } from "../lib/api";
import ConnectButton from "./ConnectButton";

interface OpenJobLocation {
  id: number;
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  currency: string;
  proposed_price: string | null;
  property_id: number;
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

function messageFromResponse(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
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
  const t = useTranslations("components.openJobMap");
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
  const [propertyJobs, setPropertyJobs] = useState<OpenJobLocation[] | null>(null);
  const [hostId, setHostId] = useState<number | null>(null);
  const [hostName, setHostName] = useState("");

  const where = cityLabel || t("defaultCity");
  const canOfferWork = currentUser?.role === "cleaner";
  const center = useMemo<[number, number]>(
    () => CITY_CENTERS[cityLabel] ?? BULGARIA_CENTER,
    [cityLabel],
  );

  // One marker per property — group the per-job markers that share an address.
  const propertyGroups = useMemo(() => {
    const groups = new Map<number, OpenJobLocation[]>();
    for (const job of jobs) {
      const existing = groups.get(job.property_id);
      if (existing) existing.push(job);
      else groups.set(job.property_id, [job]);
    }
    return Array.from(groups.values());
  }, [jobs]);

  useEffect(() => {
    cityLabelRef.current = cityLabel;
  }, [cityLabel]);

  const openPropertyOverlay = useCallback((group: OpenJobLocation[]) => {
    setPropertyJobs(group);
    setHostId(null);
    setHostName("");

    // Host identity is never exposed on the public map endpoint — fetch it from
    // the authenticated job detail only when a cleaner can act on it.
    if (!canOfferWork || group.length === 0) return;
    apiFetch(`/api/marketplace/jobs/${group[0].id}/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { host?: number; host_name?: string } | null) => {
        if (!data) return;
        if (typeof data.host === "number") setHostId(data.host);
        if (data.host_name) setHostName(data.host_name);
      })
      .catch(() => null);
  }, [canOfferWork]);

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
        setApplyError(messageFromResponse(data, t("errors.submitFailed")));
        return;
      }

      setApplyJob(null);
    } catch {
      setApplyError(t("errors.submitFailed"));
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
        if (!res.ok) throw new Error(t("errors.loadLocationsFailed"));
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setJobs(readList<OpenJobLocation>(data));
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([]);
          setError(t("errors.loadMapFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cityLabel, t]);

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

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
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

    const markers = propertyGroups
      .filter((group) => Number.isFinite(group[0].latitude) && Number.isFinite(group[0].longitude))
      .map((group) => {
        const lead = group[0];
        const marker = L.marker([lead.latitude, lead.longitude], { icon });
        marker.on("click", () => openPropertyOverlay(group));
        marker.addTo(markerLayer);
        return marker;
      });

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
  }, [center, cityChangeSource, cityLabel, propertyGroups, openPropertyOverlay]);

  return (
    <>
      <section className="open-job-map-card" aria-label={t("sectionAriaLabel", { city: where })}>
        <div className="open-job-map-head">
          <div>
            <h2>{t("heading", { city: where })}</h2>
          </div>
          <span className="open-job-map-count">
            <Briefcase size={14} aria-hidden />
            {loading ? t("loading") : t("pinCount", { count: propertyGroups.length })}
          </span>
        </div>

        <div className="open-job-map-shell">
          <div ref={containerRef} className="open-job-map" />
          {loading ? <div className="open-job-map-state">{t("loadingPins")}</div> : null}
          {!loading && error ? <div className="open-job-map-state">{error}</div> : null}
        </div>
        <p className="map-data-credit">
          Map data:{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </p>
      </section>

      {propertyJobs && propertyJobs.length > 0 ? (
        <div
          className="host-modal-backdrop open-job-property-backdrop"
          onClick={() => setPropertyJobs(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("propertyDialogAriaLabel")}
        >
          <div className="host-modal open-job-property-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{propertyJobs[0].property_name || t("propertyFallback")}</h2>
              <button type="button" className="host-modal-close" onClick={() => setPropertyJobs(null)} aria-label={t("closeAriaLabel")}>
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="open-job-property-body">
            <div className="open-job-property-summary">
              {propertyJobs[0].property_image ? (
                <Image
                  src={propertyJobs[0].property_image}
                  alt=""
                  width={300}
                  height={236}
                  unoptimized
                />
              ) : null}
              <div className="open-job-property-summary-body">
                <span className="open-job-property-address">
                  {[
                    propertyJobs[0].property_address,
                    propertyJobs[0].property_neighborhood,
                    propertyJobs[0].property_city,
                  ]
                    .filter(Boolean)
                    .join(", ") || t("addressNotProvided")}
                </span>
                {canOfferWork ? (
                  <div className="open-job-property-host">
                    <span>{hostName ? t("hostWithName", { name: hostName }) : t("hostFallback")}</span>
                    {hostId ? <ConnectButton targetUserId={hostId} /> : null}
                  </div>
                ) : null}
              </div>
            </div>

            <h3 className="open-job-property-subtitle">
              {t("openJobsHeading")}
              <span className="open-job-property-count">{propertyJobs.length}</span>
            </h3>
            <ul className="open-job-property-list">
              {propertyJobs.map((job) => (
                <li key={job.id} className="open-job-property-job">
                  <div className="open-job-property-job-info">
                    <strong>{job.title || t("cleaningJobFallback")}</strong>
                    <span>{formatJobDate(job.scheduled_start)}</span>
                  </div>
                  <div className="open-job-property-job-right">
                    {job.proposed_price ? (
                      <span className="open-job-property-job-price">
                        {job.proposed_price} {job.currency}
                      </span>
                    ) : null}
                    {canOfferWork ? (
                      <button
                        type="button"
                        className="open-job-popup-action"
                        onClick={() => openApplicationOverlay(job)}
                      >
                        {t("applyBtn")}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </div>
      ) : null}

      {applyJob ? (
        <div
          className="host-modal-backdrop open-job-apply-backdrop"
          onClick={() => setApplyJob(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("applyDialogAriaLabel")}
        >
          <div className="host-modal open-job-apply-modal" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-header">
              <h2>{t("applyDialogHeading")}</h2>
              <button type="button" className="host-modal-close" onClick={() => setApplyJob(null)} aria-label={t("closeAriaLabel")}>
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
                  <strong>{applyJob.property_name || applyJob.title || t("propertyFallback")}</strong>
                  <span>{applyJob.property_address || t("addressNotProvided")}</span>
                  <span>{applyJob.host_name ? t("hostWithName", { name: applyJob.host_name }) : t("hostLoading")}</span>
                  <span>{formatJobDate(applyJob.scheduled_start)}</span>
                </div>
              </div>

              <label>
                <span>{t("yourPrice", { currency: applyJob.currency || "EUR" })}</span>
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
                <span>{t("messageToHost")}</span>
                <textarea
                  rows={4}
                  value={applyMessage}
                  onChange={(event) => setApplyMessage(event.target.value)}
                  placeholder={t("messagePlaceholder")}
                />
              </label>

              {applyError ? <p className="form-error">{applyError}</p> : null}
              <div className="host-form-actions">
                <button className="secondary-link" type="button" onClick={() => setApplyJob(null)}>
                  {t("cancelBtn")}
                </button>
                <button className="primary-link auth-submit" type="submit" disabled={applying}>
                  {applying ? t("sending") : t("submitBtn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

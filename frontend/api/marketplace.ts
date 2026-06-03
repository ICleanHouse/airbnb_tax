import { apiFetch } from "./client";

export function listJobs(): Promise<Response> {
  return apiFetch("/api/marketplace/jobs/");
}

export function listApplications(): Promise<Response> {
  return apiFetch("/api/marketplace/applications/");
}

export function listAssignments(): Promise<Response> {
  return apiFetch("/api/marketplace/assignments/");
}

export function listFavouriteCleaners(): Promise<Response> {
  return apiFetch("/api/marketplace/favourites/");
}

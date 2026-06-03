import { apiFetch } from "./client";
import type { PublicCleaner, PublicCleanerDetail } from "../types/cleaner";
import type { CurrentUser } from "../types/user";

export function fetchCurrentUser(): Promise<Response> {
  return apiFetch("/api/accounts/me/");
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetchCurrentUser();
  if (!response.ok) {
    throw new Error("Could not load current user.");
  }
  return (await response.json()) as CurrentUser;
}

export async function listPublicCleaners(): Promise<PublicCleaner[]> {
  const response = await apiFetch("/api/accounts/public-cleaners/");
  if (!response.ok) {
    throw new Error("Could not load cleaners.");
  }
  const data: unknown = await response.json();
  return Array.isArray(data) ? (data as PublicCleaner[]) : [];
}

export async function getPublicCleaner(cleanerId: number): Promise<PublicCleanerDetail> {
  const response = await apiFetch(`/api/accounts/public-cleaners/${cleanerId}/`);
  if (!response.ok) {
    throw new Error("Could not load cleaner profile.");
  }
  return (await response.json()) as PublicCleanerDetail;
}

export function logout(): Promise<Response> {
  return apiFetch("/api/accounts/logout/", { method: "POST" });
}

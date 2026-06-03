import { apiFetch } from "./client";

const BASE = "/api/notifications/notifications";

export function getUnreadNotificationCount(): Promise<Response> {
  return apiFetch(`${BASE}/unread-count/`);
}

export function listNotifications(): Promise<Response> {
  return apiFetch(`${BASE}/`);
}

export function markNotificationRead(id: number): Promise<Response> {
  return apiFetch(`${BASE}/${id}/mark_read/`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<Response> {
  return apiFetch(`${BASE}/read-all/`, { method: "POST" });
}

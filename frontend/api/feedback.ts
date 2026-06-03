import { apiFetch } from "./client";

export function listReviews(): Promise<Response> {
  return apiFetch("/api/feedback/reviews/");
}

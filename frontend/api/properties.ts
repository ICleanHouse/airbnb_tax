import { apiFetch } from "./client";

export function listProperties(): Promise<Response> {
  return apiFetch("/api/properties/properties/");
}

export function createProperty(body: BodyInit): Promise<Response> {
  return apiFetch("/api/properties/properties/", { method: "POST", body });
}

export const ICS_MAX_BYTES = 1024 * 1024;
export const PROPERTY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CLEANER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type UploadValidationIssue = "invalid_type" | "too_large";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ICS_MIME_TYPES = new Set([
  "text/calendar",
  "application/ics",
  "application/octet-stream",
]);

function extension(filename: string): string {
  const separator = filename.lastIndexOf(".");
  return separator >= 0 ? filename.slice(separator + 1).toLocaleLowerCase("en") : "";
}

export function validateImageFile(file: File, maxBytes: number): UploadValidationIssue | null {
  const mimeAllowed = IMAGE_MIME_TYPES.has(file.type.toLocaleLowerCase("en"));
  const extensionAllowed = IMAGE_EXTENSIONS.has(extension(file.name));
  if ((file.type && !mimeAllowed) || (!file.type && !extensionAllowed)) return "invalid_type";
  if (file.size > maxBytes) return "too_large";
  return null;
}

export function validateIcsFile(file: File): UploadValidationIssue | null {
  if (extension(file.name) !== "ics") return "invalid_type";
  if (file.type && !ICS_MIME_TYPES.has(file.type.toLocaleLowerCase("en"))) return "invalid_type";
  if (file.size > ICS_MAX_BYTES) return "too_large";
  return null;
}

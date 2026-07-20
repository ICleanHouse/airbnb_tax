import { describe, expect, it } from "vitest";

import {
  CLEANER_IMAGE_MAX_BYTES,
  ICS_MAX_BYTES,
  PROPERTY_IMAGE_MAX_BYTES,
  validateIcsFile,
  validateImageFile,
} from "./uploadValidation";


describe("upload validation hints", () => {
  it("uses the Stage 1 byte limits", () => {
    expect(ICS_MAX_BYTES).toBe(1024 * 1024);
    expect(PROPERTY_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(CLEANER_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it("accepts case-insensitive ICS files with permitted browser MIME hints", () => {
    expect(validateIcsFile(new File(["calendar"], "CALENDAR.ICS", { type: "application/octet-stream" }))).toBeNull();
    expect(validateIcsFile(new File(["calendar"], "calendar.ics", { type: "application/ics" }))).toBeNull();
  });

  it("rejects wrong ICS extensions, MIME hints, and oversized files", () => {
    expect(validateIcsFile(new File(["calendar"], "calendar.txt", { type: "text/calendar" }))).toBe("invalid_type");
    expect(validateIcsFile(new File(["calendar"], "calendar.ics", { type: "text/plain" }))).toBe("invalid_type");
    expect(validateIcsFile(new File([new Uint8Array(ICS_MAX_BYTES + 1)], "calendar.ics", { type: "text/calendar" }))).toBe("too_large");
  });

  it("permits only JPEG, PNG, and WebP image hints within each policy size", () => {
    expect(validateImageFile(new File(["image"], "photo.jpg", { type: "image/jpeg" }), PROPERTY_IMAGE_MAX_BYTES)).toBeNull();
    expect(validateImageFile(new File(["image"], "photo.png", { type: "image/png" }), PROPERTY_IMAGE_MAX_BYTES)).toBeNull();
    expect(validateImageFile(new File(["image"], "photo.webp", { type: "image/webp" }), CLEANER_IMAGE_MAX_BYTES)).toBeNull();
    expect(validateImageFile(new File(["image"], "photo.gif", { type: "image/gif" }), PROPERTY_IMAGE_MAX_BYTES)).toBe("invalid_type");
    expect(validateImageFile(new File([new Uint8Array(CLEANER_IMAGE_MAX_BYTES + 1)], "photo.png", { type: "image/png" }), CLEANER_IMAGE_MAX_BYTES)).toBe("too_large");
  });
});

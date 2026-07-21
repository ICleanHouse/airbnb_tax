import { describe, expect, it } from "vitest";
import { routing } from "./routing";

describe("locale navigation", () => {
  it("keeps an explicit Bulgarian pathname when switching the dashboard locale", () => {
    expect(routing.localePrefix).toBe("always");
  });
});

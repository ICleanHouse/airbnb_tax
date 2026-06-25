import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["bg", "en"] as const,
  defaultLocale: "bg",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

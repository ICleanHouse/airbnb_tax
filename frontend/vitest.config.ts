import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    clearMocks: true,
    restoreMocks: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // CSRF checks in auth routes compare Origin to apiConfig.dashboardUrl; dotenv is skipped under Vitest.
    env: {
      DASHBOARD_URL: "http://localhost:3000",
    },
  },
});

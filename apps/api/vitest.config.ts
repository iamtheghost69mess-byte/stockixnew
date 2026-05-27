import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // CSRF checks in auth routes compare Origin to apiConfig.dashboardUrl; dotenv is skipped under Vitest.
    env: {
      NODE_ENV: "test",
      DASHBOARD_URL: "http://localhost:3000",
      SESSION_SECRET: "test-session-secret-32-chars-minimum-length",
      AUTH_TOKEN_SECRET: "test-auth-token-secret-32-chars-minimum",
      PLATFORM_API_SECRET: "test-platform-api-secret-32-chars-minimum",
      INTERNAL_API_SECRET: "test-internal-api-secret-32-chars-min",
      DEPLOYMENT_SECRET_KEY: "test-deployment-secret-key-32-chars-min",
      LICENSE_SIGNING_SECRET: "test-license-signing-secret-32-chars-min",
      WORKER_SECRET: "test-worker-secret-32-chars-minimum-length",
      POS_PLATFORM_BASE_URL: "http://127.0.0.1:8010",
      POS_FRONTEND_URL: "http://127.0.0.1:3001",
      PMS_BASE_URL: "http://127.0.0.1:3003",
      STOCKIX_FINANCE_INTERNAL_HOST: "127.0.0.1",
    },
  },
});

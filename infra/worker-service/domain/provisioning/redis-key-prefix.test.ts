import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildTenantEnvMap } from "./tenant-env.js";
import { getRepoRoot } from "../repo-root.js";

const require = createRequire(import.meta.url);

const sampleTenantEnvParams = {
  slug: "acme-corp",
  stockixFinanceRoot: "/app/finance",
  baseUrl: "http://acme.example.com",
  jwtSecret: "test-jwt-secret-min-32-characters!!",
  dbPassword: "tenant-db-pass",
  dbRootPassword: "root-pass",
  publicProxyPort: 4100,
  adminEmail: "admin@acme.example.com",
  agendashUser: "agendash",
  agendashPassword: "agendash-pass",
  s3Region: "us-east-1",
  s3AccessKeyId: "key",
  s3SecretAccessKey: "secret",
  s3Endpoint: "https://s3.example.com",
  s3Bucket: "bucket",
  s3ForcePathStyle: "true",
};

describe("tenant REDIS_KEY_PREFIX contract", () => {
  it("buildTenantEnvMap sets tenant-scoped REDIS_KEY_PREFIX", () => {
    const envMap = buildTenantEnvMap(sampleTenantEnvParams);
    expect(envMap.REDIS_KEY_PREFIX).toBe("tenant:acme-corp:");
  });

  it("uses slug in prefix for hyphenated tenant slugs", () => {
    const envMap = buildTenantEnvMap({ ...sampleTenantEnvParams, slug: "beta-shop" });
    expect(envMap.REDIS_KEY_PREFIX).toBe("tenant:beta-shop:");
  });
});

describe("POS BullMQ queue prefix contract", () => {
  const jobQueuePath = join(
    getRepoRoot(),
    "services/posnew/apps/pos-backend/services/jobQueue.js",
  );

  function loadJobQueueWithPrefix(prefix: string) {
    delete require.cache[jobQueuePath];
    process.env.REDIS_KEY_PREFIX = prefix;
    return require(jobQueuePath) as {
      queueName: (base: string) => string;
      QUEUE_BASE_NAMES: string[];
    };
  }

  it("keeps base queue names colon-free and uses BullMQ prefix for tenant isolation", () => {
    const prefix = "tenant:acme-corp:";
    const jobQueue = loadJobQueueWithPrefix(prefix) as {
      queueName: (base: string) => string;
      bullMqPrefix: () => string;
      QUEUE_BASE_NAMES: string[];
    };
    expect(jobQueue.bullMqPrefix()).toBe("bull:tenant:acme-corp");
    for (const base of jobQueue.QUEUE_BASE_NAMES) {
      const resolved = jobQueue.queueName(base);
      expect(resolved).toBe(base);
      expect(resolved.includes(":")).toBe(false);
    }
    delete process.env.REDIS_KEY_PREFIX;
  });

  it("strips legacy prefixed queue names when resolving base name", () => {
    const prefix = "tenant:acme:";
    const jobQueue = loadJobQueueWithPrefix(prefix) as {
      queueName: (base: string) => string;
    };
    expect(jobQueue.queueName(`${prefix}email`)).toBe("email");
    delete process.env.REDIS_KEY_PREFIX;
  });
});

describe("Finance BullMQ queue inventory", () => {
  it("registers queues via BullModule.registerQueue (global REDIS_KEY_PREFIX applies)", () => {
    const serverRoot = join(
      getRepoRoot(),
      "services/stockix-finance/packages/server/src/modules",
    );
    const moduleFiles = readdirSync(serverRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(serverRoot, d.name, `${d.name}.module.ts`));

    let registerQueueCount = 0;
    for (const file of moduleFiles) {
      try {
        const text = readFileSync(file, "utf8");
        registerQueueCount += (text.match(/BullModule\.registerQueue/g) ?? []).length;
      } catch {
        // module file naming edge cases — skip
      }
    }

    expect(registerQueueCount).toBeGreaterThanOrEqual(9);
  });

  it("App.module configures BullModule.forRoot with REDIS_KEY_PREFIX", () => {
    const appModule = readFileSync(
      join(
        getRepoRoot(),
        "services/stockix-finance/packages/server/src/modules/App/App.module.ts",
      ),
      "utf8",
    );
    expect(appModule).toContain("prefix: process.env.REDIS_KEY_PREFIX");
    expect(appModule).toContain("REDIS_KEY_PREFIX isolates this tenant");
  });
});

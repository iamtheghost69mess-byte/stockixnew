import { describe, expect, it } from "vitest";

import {
  redactComposeLogLine,
  redactEnvForLogging,
} from "./redact-compose-log.js";

describe("redactComposeLogLine", () => {
  it("redacts MAIL_PASSWORD= and JWT_SECRET= patterns", () => {
    expect(redactComposeLogLine("env MAIL_PASSWORD=super-secret-smtp")).toContain("[REDACTED]");
    expect(redactComposeLogLine("env MAIL_PASSWORD=super-secret-smtp")).not.toContain(
      "super-secret-smtp",
    );
    expect(redactComposeLogLine('export JWT_SECRET="my-jwt-key"')).not.toContain("my-jwt-key");
  });

  it("passes through normal compose progress lines unchanged", () => {
    const line = "Container stockix-acme-server-1  Started";
    expect(redactComposeLogLine(line)).toBe(line);
  });
});

describe("redactEnvForLogging", () => {
  it("redacts sensitive keys only", () => {
    const redacted = redactEnvForLogging({
      COMPOSE_PROJECT_NAME: "stockix-acme",
      JWT_SECRET: "secret-value",
      PUBLIC_PROXY_PORT: "4100",
    });
    expect(redacted.JWT_SECRET).toBe("[REDACTED]");
    expect(redacted.PUBLIC_PROXY_PORT).toBe("4100");
  });
});

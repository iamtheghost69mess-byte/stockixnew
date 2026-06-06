import { describe, expect, it } from "vitest";

import { TENANT_SERVER_UP_COMPOSE_ARGS } from "../domain/provisioning/tenant-server-compose-args.js";

describe("TENANT_SERVER_UP_COMPOSE_ARGS", () => {
  it("starts server without compose dependencies to avoid double migration", () => {
    expect(TENANT_SERVER_UP_COMPOSE_ARGS).toContain("--no-deps");
    expect(TENANT_SERVER_UP_COMPOSE_ARGS.at(-1)).toBe("server");
  });
});

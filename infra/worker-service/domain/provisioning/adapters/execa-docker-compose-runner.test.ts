import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue(undefined),
}));

import { execa } from "execa";

import { ExecaDockerComposeRunner } from "./execa-docker-compose-runner.js";

describe("ExecaDockerComposeRunner", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes --env-file to docker compose (Finance and POS provisioning)", async () => {
    const runner = new ExecaDockerComposeRunner();
    const envPath = "/opt/stockix/tenants/acme/.env";
    await runner.run(
      "/repo/infra/pos-tenant-stack/docker-compose.yml",
      "stockix-pos-acme",
      envPath,
      { COMPOSE_PROJECT_NAME: "stockix-pos-acme" },
      ["up", "-d", "--no-build", "pos-backend"],
    );

    expect(execa).toHaveBeenCalledWith(
      "docker",
      [
        "compose",
        "-f",
        "/repo/infra/pos-tenant-stack/docker-compose.yml",
        "-p",
        "stockix-pos-acme",
        "--env-file",
        envPath,
        "up",
        "-d",
        "--no-build",
        "pos-backend",
      ],
      expect.objectContaining({ extendEnv: true }),
    );
  });
});

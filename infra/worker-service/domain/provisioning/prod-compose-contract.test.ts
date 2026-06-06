import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getRepoRoot } from "../repo-root.js";

describe("infra/prod/docker-compose.yml security contract", () => {
  const composeText = readFileSync(
    join(getRepoRoot(), "infra", "prod", "docker-compose.yml"),
    "utf8",
  );

  it("disables BUILD on socket-proxy and enables EVENTS for Traefik watches", () => {
    const proxyBlock = composeText.slice(
      composeText.indexOf("socket-proxy:"),
      composeText.indexOf("traefik:"),
    );
    expect(proxyBlock).toContain("BUILD: 0");
    expect(proxyBlock).toContain("EVENTS: 1");
    expect(proxyBlock).toContain("POST: 1");
  });

  it("routes Traefik docker provider through socket-proxy without host socket mount", () => {
    const traefikBlock = composeText.slice(
      composeText.indexOf("traefik:"),
      composeText.indexOf("postgres:"),
    );
    expect(traefikBlock).toContain("--providers.docker.endpoint=tcp://socket-proxy:2375");
    expect(traefikBlock).not.toContain("/var/run/docker.sock");
    expect(traefikBlock).toContain("socket_proxy_network");
  });
});

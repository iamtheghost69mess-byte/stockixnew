import { describe, expect, it } from "vitest";

import {
  evaluateModuleGatedReadinessChecks,
  hasPosStackCompletedEvent,
  isFinanceTraefikRouteActiveFromEvents,
} from "../src/provisioning/readiness-engine.js";

describe("hasPosStackCompletedEvent", () => {
  it("detects pos.stack.completed phase", () => {
    expect(
      hasPosStackCompletedEvent([{ phase: "pos.stack.completed", meta: null, message: "ok" }]),
    ).toBe(true);
  });

  it("detects journal pos.stack operationKey", () => {
    expect(
      hasPosStackCompletedEvent([
        { phase: "journal", meta: { operationKey: "pos.stack" }, message: "started" },
      ]),
    ).toBe(true);
  });
});

describe("isFinanceTraefikRouteActiveFromEvents", () => {
  const edgePublishEvent = (slug: string) => ({
    phase: "journal" as const,
    meta: { operationKey: "edge.publish", slug, internalPort: 4100 },
    message: "Traefik edge publish completed",
  });

  it("returns true when edge.publish journal matches tenant slug", () => {
    expect(
      isFinanceTraefikRouteActiveFromEvents("acme", [edgePublishEvent("acme")]),
    ).toBe(true);
  });

  it("returns false when slug mismatches or journal is missing", () => {
    expect(isFinanceTraefikRouteActiveFromEvents("acme", [edgePublishEvent("other")])).toBe(
      false,
    );
    expect(isFinanceTraefikRouteActiveFromEvents("acme", [])).toBe(false);
    expect(isFinanceTraefikRouteActiveFromEvents(null, [edgePublishEvent("acme")])).toBe(false);
  });
});

describe("evaluateModuleGatedReadinessChecks", () => {
  const financeReady = {
    jobCompleted: true,
    tenantExists: true,
    deploymentValid: true,
    financeRouteActive: true,
    financeAuthReady: true,
    financeResponding: true,
    financeTenantLinked: true,
    financeLicenseSynced: true,
    posStackReady: false,
    posResponding: false,
    posOrganizationLinked: false,
  };

  it("POS-only skips finance checks and uses POS signals", () => {
    const checks = evaluateModuleGatedReadinessChecks({
      ...financeReady,
      modules: ["pos"],
      financeAuthReady: false,
      financeRouteActive: false,
      financeResponding: false,
      financeTenantLinked: false,
      financeLicenseSynced: false,
      posStackReady: true,
      posResponding: true,
      posOrganizationLinked: true,
    });

    expect(checks.authReady).toBe(true);
    expect(checks.routeActive).toBe(true);
    expect(checks.tenantResponding).toBe(true);
    expect(checks.financeTenantLinked).toBe(true);
    expect(checks.financeLicenseSynced).toBe(true);
  });

  it("accounting-only requires finance checks", () => {
    const checks = evaluateModuleGatedReadinessChecks({
      ...financeReady,
      modules: ["accounting"],
      financeAuthReady: false,
    });

    expect(checks.authReady).toBe(false);
    expect(checks.financeTenantLinked).toBe(true);
  });

  it("combined modules keep finance readiness requirements", () => {
    const checks = evaluateModuleGatedReadinessChecks({
      ...financeReady,
      modules: ["accounting", "pos"],
      financeResponding: false,
      posResponding: true,
    });

    expect(checks.tenantResponding).toBe(false);
    expect(checks.authReady).toBe(true);
  });
});

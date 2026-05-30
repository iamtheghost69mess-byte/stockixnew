import { describe, expect, it } from "vitest";

import {
  evaluateModuleGatedReadinessChecks,
  hasPosStackCompletedEvent,
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

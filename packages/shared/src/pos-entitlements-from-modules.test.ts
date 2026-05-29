import { describe, expect, it } from "vitest";
import {
  buildPosEntitlementsForProvision,
  posModuleEntitlementsFromStockixModules,
} from "./pos-entitlements-from-modules.js";

describe("posModuleEntitlementsFromStockixModules", () => {
  it("POS-only disables accounting", () => {
    expect(posModuleEntitlementsFromStockixModules(["pos"])).toEqual({
      inventory: true,
      accounting: false,
    });
  });

  it("bundle with accounting enables both modules", () => {
    expect(posModuleEntitlementsFromStockixModules(["pos", "accounting"])).toEqual({
      inventory: true,
      accounting: true,
    });
  });

  it("accounting-only still enables accounting module on POS org", () => {
    expect(posModuleEntitlementsFromStockixModules(["accounting"])).toEqual({
      inventory: true,
      accounting: true,
    });
  });
});

describe("buildPosEntitlementsForProvision", () => {
  it("merges plan limits with module flags", () => {
    const ent = buildPosEntitlementsForProvision({
      modules: ["pos"],
      maxUsers: 10,
      maxLocations: 2,
    });
    expect(ent.maxUsers).toBe(10);
    expect(ent.maxLocations).toBe(2);
    expect(ent.modules).toEqual({ inventory: true, accounting: false });
  });
});

import { describe, expect, it } from "vitest";
import {
  assertOrgInSupportScope,
  filterOrganizationsForSupportAgent,
} from "../src/org-access-scope.js";

describe("org-access-scope helpers", () => {
  it("does not filter for super_admin", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(filterOrganizationsForSupportAgent("super_admin", rows, ["a"])).toEqual(rows);
  });

  it("returns all rows for support_agent when unscoped (null)", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(filterOrganizationsForSupportAgent("support_agent", rows, null)).toEqual(rows);
  });

  it("filters support_agent to scoped org ids only", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterOrganizationsForSupportAgent("support_agent", rows, ["b"])).toEqual([{ id: "b" }]);
  });

  it("assertOrgInSupportScope allows non-support always", () => {
    expect(assertOrgInSupportScope("read_only", "x", ["y"])).toBe(true);
    expect(assertOrgInSupportScope("billing_manager", "x", ["y"])).toBe(true);
  });

  it("assertOrgInSupportScope allows support when unscoped", () => {
    expect(assertOrgInSupportScope("support_agent", "any", null)).toBe(true);
  });

  it("assertOrgInSupportScope enforces support scoped set", () => {
    expect(assertOrgInSupportScope("support_agent", "a", ["a", "b"])).toBe(true);
    expect(assertOrgInSupportScope("support_agent", "c", ["a", "b"])).toBe(false);
  });
});

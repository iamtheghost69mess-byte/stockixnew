import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getProvisionStackPlan,
  isModuleGatingEnabled,
  resolveTenantModules,
  shouldProvisionFinanceStack,
} from "../../../infra/worker-service/src/module-stacks.js";

function withGating(value: string | undefined, fn: () => void) {
  const prev = process.env.PROVISION_MODULE_GATING;
  if (value === undefined) {
    delete process.env.PROVISION_MODULE_GATING;
  } else {
    process.env.PROVISION_MODULE_GATING = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.PROVISION_MODULE_GATING;
    } else {
      process.env.PROVISION_MODULE_GATING = prev;
    }
  }
}

describe("resolveTenantModules", () => {
  it("defaults to accounting when modules is undefined, null, or empty", () => {
    expect(resolveTenantModules(undefined)).toEqual(["accounting"]);
    expect(resolveTenantModules(null)).toEqual(["accounting"]);
    expect(resolveTenantModules([])).toEqual(["accounting"]);
    expect(resolveTenantModules(["", "  "])).toEqual(["accounting"]);
  });

  it("preserves explicit module lists", () => {
    expect(resolveTenantModules(["pos"])).toEqual(["pos"]);
    expect(resolveTenantModules(["accounting", "pos"])).toEqual([
      "accounting",
      "pos",
    ]);
  });
});

describe("isModuleGatingEnabled", () => {
  it("is enabled by default and when PROVISION_MODULE_GATING=1", () => {
    withGating("1", () => {
      expect(isModuleGatingEnabled()).toBe(true);
    });
    withGating(undefined, () => {
      expect(isModuleGatingEnabled()).toBe(true);
    });
  });

  it("is disabled only when PROVISION_MODULE_GATING=0", () => {
    withGating("0", () => {
      expect(isModuleGatingEnabled()).toBe(false);
    });
  });
});

describe("provision stack plan (default gating — on unless PROVISION_MODULE_GATING=0)", () => {
  beforeEach(() => {
    delete process.env.PROVISION_MODULE_GATING;
  });

  afterEach(() => {
    delete process.env.PROVISION_MODULE_GATING;
  });

  it("modules=['pos'] → Finance stack NOT started, POS started", () => {
    const plan = getProvisionStackPlan(["pos"]);
    expect(shouldProvisionFinanceStack(["pos"])).toBe(false);
    expect(plan.finance).toBe(false);
    expect(plan.pos).toBe(true);
    expect(plan.pms).toBe(false);
    expect(plan.chat).toBe(false);
  });

  it("modules=['accounting'] → Finance stack started, POS not started", () => {
    const plan = getProvisionStackPlan(["accounting"]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(false);
  });

  it("modules=['accounting','pos'] → both Finance and POS started", () => {
    const plan = getProvisionStackPlan(["accounting", "pos"]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(true);
  });
});

describe("provision stack plan (PROVISION_MODULE_GATING=1)", () => {
  beforeEach(() => {
    process.env.PROVISION_MODULE_GATING = "1";
  });

  afterEach(() => {
    delete process.env.PROVISION_MODULE_GATING;
  });

  it("modules=['pos'] → Finance stack NOT started, POS started", () => {
    const plan = getProvisionStackPlan(["pos"]);
    expect(shouldProvisionFinanceStack(["pos"])).toBe(false);
    expect(plan.finance).toBe(false);
    expect(plan.pos).toBe(true);
    expect(plan.pms).toBe(false);
    expect(plan.chat).toBe(false);
  });

  it("modules=['accounting'] → Finance stack started, POS not started", () => {
    const plan = getProvisionStackPlan(["accounting"]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(false);
  });

  it("modules=['accounting','pos'] → both Finance and POS started", () => {
    const plan = getProvisionStackPlan(["accounting", "pos"]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(true);
  });

  it("empty modules → Finance started (accounting default)", () => {
    const plan = getProvisionStackPlan([]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(false);
  });
});

describe("provision stack plan (PROVISION_MODULE_GATING=0)", () => {
  beforeEach(() => {
    process.env.PROVISION_MODULE_GATING = "0";
  });

  afterEach(() => {
    delete process.env.PROVISION_MODULE_GATING;
  });

  it("modules=['pos'] still starts Finance (legacy behavior)", () => {
    const plan = getProvisionStackPlan(["pos"]);
    expect(plan.finance).toBe(true);
    expect(plan.pos).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeFinanceApiJson,
  parseFinanceApiJsonText,
} from "@repo/shared/finance-api";

describe("normalizeFinanceApiJson", () => {
  it("maps activate-warehouses snake_case response", () => {
    const out = normalizeFinanceApiJson({
      success: true,
      primary_warehouse_id: 1,
      already_activated: true,
    }) as Record<string, unknown>;

    expect(out.primaryWarehouseId).toBe(1);
    expect(out.alreadyActivated).toBe(true);
  });

  it("maps seed-pos-defaults snake_case response", () => {
    const out = normalizeFinanceApiJson({
      walk_in_customer_id: 10,
      cash_account_id: 20,
      card_account_id: 30,
    }) as Record<string, unknown>;

    expect(out.walkInCustomerId).toBe(10);
    expect(out.cashAccountId).toBe(20);
    expect(out.cardAccountId).toBe(30);
  });

  it("normalizes nested job poll payloads", () => {
    const out = normalizeFinanceApiJson({
      data: { job_id: "abc", is_completed: true },
    }) as Record<string, unknown>;
    const data = out.data as Record<string, unknown>;
    expect(data.jobId).toBe("abc");
    expect(data.isCompleted).toBe(true);
  });
});

describe("parseFinanceApiJsonText", () => {
  it("parses JSON text and normalizes keys", () => {
    const body = parseFinanceApiJsonText(
      '{"primary_warehouse_id":42,"already_activated":false}',
    );
    expect(body.primaryWarehouseId).toBe(42);
    expect(body.alreadyActivated).toBe(false);
  });
});

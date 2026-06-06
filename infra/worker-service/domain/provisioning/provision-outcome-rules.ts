/** Worker job completion outcome derived from a provision result. */
export type ProvisionJobOutcome = "success" | "partial" | "failed";

export function resolveProvisionJobOutcome(input: {
  ok: boolean;
  tenantStatus?: "active" | "partial";
}): ProvisionJobOutcome {
  if (!input.ok) return "failed";
  if (input.tenantStatus === "partial") return "partial";
  return "success";
}

/** POS-only retry jobs must fail when POS provisioning fails (not partial success). */
export function shouldPosOnlyRetryFailJob(input: {
  posOnlyRetry: boolean;
  posStatus?: "ok" | "failed" | "skipped";
}): boolean {
  return input.posOnlyRetry && input.posStatus === "failed";
}

export class ProvisionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}
// REPAIRED: actionable POS stub error 2026-06-05

// Ensure env bootstrapping runs before any env reads in this module.
import "./env";

export const moduleGatingConfig = {
  /**
   * When true (default), worker provisions only the Docker stacks matching
   * the tenant's modules[] array.
   * Set PROVISION_MODULE_GATING=0 for legacy mode (always provisions Finance).
   */
  get enabled() {
    return process.env.PROVISION_MODULE_GATING !== "0";
  },
} as const;

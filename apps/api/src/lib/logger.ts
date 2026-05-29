import { logger as structuredLogger } from "@repo/shared/structured-logger";

export const logger = structuredLogger;

/** Default callback for modules that accept `log: (message: string) => void`. */
export function logLine(message: string): void {
  structuredLogger.info(message);
}

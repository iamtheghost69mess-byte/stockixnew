import { logger as structuredLogger } from "@repo/shared/structured-logger";

export const logger = structuredLogger;

export function logLine(message: string): void {
  structuredLogger.info(message);
}

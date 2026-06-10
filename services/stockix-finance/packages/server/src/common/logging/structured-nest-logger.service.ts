import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { logger } from '@repo/shared/structured-logger';

function parseMessage(message: unknown): { msg: string; meta?: Record<string, unknown> } {
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && 'level' in parsed) {
        const { level: _level, message: nestedMessage, msg, ...rest } = parsed;
        return {
          msg: String(nestedMessage ?? msg ?? message),
          meta: rest,
        };
      }
    } catch {
      // not JSON — use as plain message
    }
    return { msg: message };
  }
  return { msg: String(message) };
}

@Injectable()
export class StructuredNestLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    const { msg, meta } = parseMessage(message);
    logger.info(msg, { context, ...meta });
  }

  error(message: unknown, trace?: string, context?: string): void {
    const { msg, meta } = parseMessage(message);
    logger.error(msg, trace ? new Error(trace) : undefined, { context, ...meta });
  }

  warn(message: unknown, context?: string): void {
    const { msg, meta } = parseMessage(message);
    logger.warn(msg, { context, ...meta });
  }

  debug(message: unknown, context?: string): void {
    const { msg, meta } = parseMessage(message);
    logger.debug(msg, { context, ...meta });
  }

  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }

  setLogLevels(_levels: LogLevel[]): void {
    // structured-logger uses NODE_ENV for debug gating
  }
}

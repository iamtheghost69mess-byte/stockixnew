type LogMeta = Record<string, unknown>;

function write(stream: NodeJS.WriteStream, payload: Record<string, unknown>): void {
  stream.write(`${JSON.stringify(payload)}\n`);
}

const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  info(msg: string, meta?: LogMeta): void {
    write(process.stdout, {
      level: "info",
      msg,
      ts: new Date().toISOString(),
      ...meta,
    });
  },
  warn(msg: string, meta?: LogMeta): void {
    write(process.stderr, {
      level: "warn",
      msg,
      ts: new Date().toISOString(),
      ...meta,
    });
  },
  error(msg: string, error?: unknown, meta?: LogMeta): void {
    write(process.stderr, {
      level: "error",
      msg,
      ts: new Date().toISOString(),
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
      ...meta,
    });
  },
  debug(msg: string, meta?: LogMeta): void {
    if (!isDev) return;
    write(process.stdout, {
      level: "debug",
      msg,
      ts: new Date().toISOString(),
      ...meta,
    });
  },
};

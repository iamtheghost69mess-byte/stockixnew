type LogMeta = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "mfasecret",
  "passportnumber",
  "visanumber",
  "sessionsecret",
  "authtokensecret",
  "workersecret",
  "idnumber",
  "dateofbirth",
  "nationality",
]);

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }
  if (typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        res[k] = "[REDACTED]";
      } else {
        res[k] = redactObject(v);
      }
    }
    return res;
  }
  return obj;
}

function write(stream: NodeJS.WriteStream, payload: Record<string, unknown>): void {
  const redacted = redactObject(payload) as Record<string, unknown>;
  stream.write(`${JSON.stringify(redacted)}\n`);
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

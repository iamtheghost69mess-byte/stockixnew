/**
 * Minimal structured logger for POS backend.
 * Development: human-readable with level prefix.
 * Staging/production: JSON lines to stdout (info) / stderr (warn/error).
 */
const IS_DEV = (process.env.NODE_ENV || "development") === "development";

function serialize(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message;
      if (typeof a === "object" && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(" ");
}

function emit(level, stream, args) {
  const ts = new Date().toISOString();
  if (IS_DEV) {
    stream.write(`[${ts}] [${level.toUpperCase()}] ${serialize(args)}\n`);
    return;
  }
  stream.write(JSON.stringify({ ts, level, msg: serialize(args) }) + "\n");
}

const logger = {
  info:  (...args) => emit("info",  process.stdout, args),
  warn:  (...args) => emit("warn",  process.stderr, args),
  error: (...args) => emit("error", process.stderr, args),
};

module.exports = logger;

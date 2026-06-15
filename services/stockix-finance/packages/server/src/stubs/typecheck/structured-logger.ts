type LogMeta = Record<string, unknown>;

export const logger = {
  info(msg: string, meta?: LogMeta): void {
    void msg;
    void meta;
  },
  warn(msg: string, meta?: LogMeta): void {
    void msg;
    void meta;
  },
  error(msg: string, error?: unknown, meta?: LogMeta): void {
    void msg;
    void error;
    void meta;
  },
  debug(msg: string, meta?: LogMeta): void {
    void msg;
    void meta;
  },
};

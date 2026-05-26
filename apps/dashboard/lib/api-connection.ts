/** True when fetch failed because the control-plane API is down or unreachable. */
export function isApiConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "fetch failed" || error.message.includes("ECONNREFUSED")) {
    return true;
  }
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
}

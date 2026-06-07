/** True when fetch failed because the control-plane API is down or unreachable. */
export function isApiConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    error.name === "TimeoutError"
    || error.name === "AbortError"
    || error.name === "HeadersTimeoutError"
    || error.message === "fetch failed"
    || error.message.includes("ECONNREFUSED")
    || error.message.includes("timed out")
    || error.message.includes("Headers Timeout")
  ) {
    return true;
  }
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    const causeName = cause.name;
    return (
      code === "ECONNREFUSED"
      || code === "ENOTFOUND"
      || code === "EAI_AGAIN"
      || code === "UND_ERR_HEADERS_TIMEOUT"
      || causeName === "HeadersTimeoutError"
    );
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
}

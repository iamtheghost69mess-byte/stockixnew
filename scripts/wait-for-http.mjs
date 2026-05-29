/**
 * Poll an HTTP URL until it returns a 2xx response or timeout.
 * @param {string} url
 * @param {{ timeoutMs?: number; label?: string }} [opts]
 */
export async function waitForHttp(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const label = opts.label ?? url;
  const started = Date.now();
  console.log(`[wait] Waiting for ${label}…`);

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        console.log(`[wait] ✅ ${label} ready (${Date.now() - started}ms)`);
        return;
      }
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(`[wait] Timed out after ${timeoutMs}ms waiting for ${label}`);
}

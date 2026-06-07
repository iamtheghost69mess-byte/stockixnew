/**
 * Poll an HTTP URL until it returns a 2xx response or timeout.
 * @param {string} url
 * @param {{ timeoutMs?: number; label?: string; stableChecks?: number; intervalMs?: number }} [opts]
 */
export async function waitForHttp(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const label = opts.label ?? url;
  const stableChecks = opts.stableChecks ?? 1;
  const intervalMs = opts.intervalMs ?? 1_000;
  const started = Date.now();
  console.log(`[wait] Waiting for ${label}…`);

  let consecutiveOk = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        consecutiveOk++;
        if (consecutiveOk >= stableChecks) {
          console.log(`[wait] ✅ ${label} ready (${Date.now() - started}ms)`);
          return;
        }
      } else {
        consecutiveOk = 0;
      }
    } catch {
      consecutiveOk = 0;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`[wait] Timed out after ${timeoutMs}ms waiting for ${label}`);
}

/**
 * Wait until control-plane API is ready (DB + Redis checks via GET /ready).
 * @param {string} apiBase e.g. http://127.0.0.1:4000
 * @param {{ timeoutMs?: number; label?: string }} [opts]
 */
export async function waitForControlPlaneReady(apiBase, opts = {}) {
  const base = apiBase.replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const label = opts.label ?? `API ready (${base})`;
  await waitForHttp(`${base}/ready`, {
    timeoutMs,
    label,
    stableChecks: 2,
    intervalMs: 1_000,
  });
}

/**
 * Find the first available TCP port starting at `preferred`.
 * Probes the same bind addresses dev servers use (0.0.0.0 / ::), not only 127.0.0.1,
 * so Windows does not report a false "free" when Next/worker hold :::port.
 */
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function isPortFreeOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (err) => {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code;
      if (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT") {
        resolve(true);
        return;
      }
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export async function isPortFree(port) {
  if (!(await isPortFreeOnHost(port, "0.0.0.0"))) return false;
  return isPortFreeOnHost(port, "::");
}

/**
 * @param {number} preferred
 * @param {number} [maxAttempts=50]
 * @returns {Promise<number>}
 */
export async function findFreePort(preferred, maxAttempts = 50) {
  const start = Number(preferred);
  if (!Number.isFinite(start) || start < 1 || start > 65535) {
    throw new Error(`Invalid preferred port: ${preferred}`);
  }
  for (let i = 0; i < maxAttempts; i++) {
    const port = start + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${start}–${start + maxAttempts - 1}`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const preferred = parseInt(process.argv[2] ?? "3000", 10);
  const port = await findFreePort(preferred);
  process.stdout.write(String(port));
}

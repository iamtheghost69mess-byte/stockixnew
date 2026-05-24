/**
 * Find the first available TCP port starting at `preferred`.
 * Used by local dev scripts when the default port is already in use.
 */
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
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

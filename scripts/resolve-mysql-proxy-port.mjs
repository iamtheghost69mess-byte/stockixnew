import { execSync } from "node:child_process";

/**
 * Host-published ProxySQL tenant port (container 6033/tcp).
 * Falls back to MYSQL_PROXY_PORT / 6033 when inspect is unavailable.
 */
export function resolveMysqlProxyHostPort() {
  try {
    const raw = execSync(
      'docker inspect stockix-shared-stockix-mysql-proxy-1 --format "{{json .NetworkSettings.Ports}}"',
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true },
    ).trim();
    const ports = JSON.parse(raw);
    const bindings = ports["6033/tcp"];
    if (!Array.isArray(bindings) || bindings.length === 0) {
      return process.env.MYSQL_PROXY_PORT ?? "6033";
    }
    const pub = bindings.find(
      (b) => b.HostIp === "127.0.0.1" || b.HostIp === "0.0.0.0",
    );
    return pub?.HostPort ?? process.env.MYSQL_PROXY_PORT ?? "6033";
  } catch {
    return process.env.MYSQL_PROXY_PORT ?? "6033";
  }
}

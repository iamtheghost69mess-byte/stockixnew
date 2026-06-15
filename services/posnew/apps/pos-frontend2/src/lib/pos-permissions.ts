/**
 * Client-side checks for permission strings returned on `GET /api/user`.
 * Supports suffix wildcards such as `backoffice.*` and `backoffice.accounting.*`.
 */
export function posCan(permissions: string[] | undefined, required: string): boolean {
  const list = permissions ?? [];
  if (list.includes("*")) return true;
  if (list.includes(required)) return true;
  const segments = required.split(".").filter(Boolean);
  for (let len = segments.length; len > 0; len -= 1) {
    const wildcard = `${segments.slice(0, len).join(".")}.*`;
    if (list.includes(wildcard)) return true;
  }
  return false;
}

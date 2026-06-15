/**
 * Finance (Bigcapital) HTTP APIs use a global SerializeInterceptor that emits snake_case keys.
 * Control-plane workers and API must normalize responses before reading camelCase fields.
 */

function snakeCaseKeyToCamel(key: string): string {
  if (!key.includes("_")) {
    return key;
  }
  const converted = key.replace(/([-_]\w)/g, (group) => group[1]!.toUpperCase());
  return converted.charAt(0).toLowerCase() + converted.slice(1);
}

/** Recursively map object keys from snake_case to camelCase (arrays/objects nested). */
export function normalizeFinanceApiJson<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFinanceApiJson(item)) as T;
  }
  if (typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    out[snakeCaseKeyToCamel(key)] = normalizeFinanceApiJson(val);
  }
  return out as T;
}

/** Parse Finance response text and normalize keys to camelCase for worker/API consumers. */
export function parseFinanceApiJsonText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { raw: text };
  }
  const normalized = normalizeFinanceApiJson(parsed);
  if (typeof normalized === "object" && normalized !== null && !Array.isArray(normalized)) {
    return normalized as Record<string, unknown>;
  }
  return { value: normalized };
}

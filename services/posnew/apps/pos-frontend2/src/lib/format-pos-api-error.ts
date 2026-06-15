import { getPosApiOrigin } from "@/config/pos-api";

/**
 * Strips the configured POS API origin and loopback URLs from strings shown in Sonner toasts / alerts,
 * so operators do not see raw internal API hostnames in toast copy.
 */
export function sanitizePosApiErrorMessage(message: string): string {
  let m = message.trim();
  if (!m) return "Request failed.";

  const origin = getPosApiOrigin().trim();
  if (origin.length > 0) {
    const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    m = m.replaceAll(new RegExp(escaped, "g"), "");
  }

  m = m.replaceAll(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/gi, "");

  m = m.replaceAll(/\s{2,}/g, " ");
  m = m.replaceAll(/^\s*[,;:.\-–—]+\s*/g, "");
  m = m.replaceAll(/\s*[,;:.\-–—]+\s*$/g, "");
  m = m.trim();

  if (!m) return "Request failed.";
  return m;
}

function isLikelyAuthzFailureMessage(msg: string): boolean {
  if (/^(403|401)\b/.test(msg)) return true;
  if (/\b403\b/i.test(msg)) return true;
  return /forbidden/i.test(msg);
}

/**
 * Maps common POS API failures to operator-friendly copy for `toast.error` (Sonner).
 */
export function formatPosMutationError(err: unknown, options?: { forbiddenHint?: string }): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.trim() || "Request failed.";
  const forbiddenHint =
    options?.forbiddenHint ?? "You don't have permission for this action. Ask a manager if you need access.";
  if (isLikelyAuthzFailureMessage(msg)) return forbiddenHint;
  return sanitizePosApiErrorMessage(msg);
}

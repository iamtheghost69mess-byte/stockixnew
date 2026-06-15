import { createHash, randomBytes } from "node:crypto";

/** Generate a one-time owner invite token (raw in URL, hash in DB). */
export function generateOwnerInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashOwnerInviteToken(raw);
  return { raw, hash };
}

export function hashOwnerInviteToken(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

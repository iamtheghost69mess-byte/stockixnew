import { randomBytes } from "node:crypto";

const SLUG_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;

export function generatePublicDiscoverySlug(): string {
  return randomBytes(18).toString("base64url");
}

export function isValidPublicDiscoverySlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

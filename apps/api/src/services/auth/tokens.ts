import { apiConfig } from "@repo/config";
import { z } from "zod";

type SessionTokenPayload = {
  sub: string;
  role: string;
  email: string;
  name: string;
  sessionVersion: number;
  iat: number;
};

type MfaTokenPayload = {
  ownerId: string;
  iat: number;
};

const sessionTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: z.string(),
  email: z.string().email(),
  name: z.string(),
  sessionVersion: z.number().int().nonnegative(),
  iat: z.number().int(),
});

const mfaTokenPayloadSchema = z.object({
  ownerId: z.string(),
  iat: z.number().int(),
});

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MFA_TTL_MS = 5 * 60 * 1000;

function secretOrThrow() {
  const secret = apiConfig.authTokenSecret;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_TOKEN_SECRET (or SESSION_SECRET fallback) must be set for auth token operations");
  }
  return secret;
}

function toB64(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromB64(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretOrThrow()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretOrThrow()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(payload),
  );
}

export async function signSessionToken(payload: Omit<SessionTokenPayload, "iat">): Promise<string> {
  const body = JSON.stringify({ ...payload, iat: Date.now() });
  const encoded = toB64(body);
  const sig = await signPayload(body);
  return `${encoded}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const body = fromB64(encoded);
    const valid = await verifyPayload(body, sig);
    if (!valid) return null;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body);
    } catch {
      return null;
    }
    const parseResult = sessionTokenPayloadSchema.safeParse(parsedJson);
    if (!parseResult.success) return null;
    const parsed = parseResult.data;
    if (Date.now() - parsed.iat > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function signMfaToken(ownerId: string): Promise<string> {
  const body = JSON.stringify({ ownerId, iat: Date.now() } satisfies MfaTokenPayload);
  const encoded = toB64(body);
  const sig = await signPayload(body);
  return `${encoded}.${sig}`;
}

export async function verifyMfaToken(token: string): Promise<string | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const body = fromB64(encoded);
    const valid = await verifyPayload(body, sig);
    if (!valid) return null;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body);
    } catch {
      return null;
    }
    const parseResult = mfaTokenPayloadSchema.safeParse(parsedJson);
    if (!parseResult.success) return null;
    const parsed = parseResult.data;
    if (Date.now() - parsed.iat > MFA_TTL_MS) return null;
    return parsed.ownerId;
  } catch {
    return null;
  }
}

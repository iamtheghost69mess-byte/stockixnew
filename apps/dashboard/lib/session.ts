import type { Role } from "@/lib/roles";

export const SESSION_COOKIE = "stockix-session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MFA_COOKIE = "stockix-mfa";
const MFA_TTL_MS = 5 * 60 * 1000;

export type SessionRole = Role;

export type SessionPayload = {
  sub: string;
  role: SessionRole;
  email: string;
  name: string;
  sessionVersion: number;
  authTime: number;
  iat: number;
};

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be set (≥ 32 chars)");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(owner: {
  id: string;
  role: Role;
  email: string;
  name: string;
  sessionVersion: number;
}): Promise<string> {
  const payloadObj: SessionPayload = {
    sub: owner.id,
    role: owner.role,
    email: owner.email,
    name: owner.name,
    sessionVersion: owner.sessionVersion,
    authTime: Date.now(),
    iat: Date.now(),
  };
  const payload = JSON.stringify(payloadObj);
  const payloadB64 = btoa(payload);
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payloadB64}.${sigB64}`;
}

const RECENT_AUTH_TTL_MS = 10 * 60 * 1000;
export const RECENT_AUTH_COOKIE = "stockix-recent-auth";
const MFA_SETUP_TTL_MS = 10 * 60 * 1000;
export const MFA_SETUP_COOKIE = "stockix-mfa-setup";

export async function signRecentAuthToken(ownerId: string): Promise<string> {
  const payload = JSON.stringify({ ownerId, iat: Date.now() });
  const payloadB64 = btoa(payload);
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyRecentAuthToken(
  token: string,
): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    payload = atob(payloadB64);
    const raw = atob(sigB64);
    sig = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sig[i] = raw.charCodeAt(i);
  } catch {
    return null;
  }
  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;
  try {
    const parsed = JSON.parse(payload) as { ownerId: string; iat: number };
    if (Date.now() - parsed.iat > RECENT_AUTH_TTL_MS) return null;
    return parsed.ownerId;
  } catch {
    return null;
  }
}

export async function signMfaSetupToken(payload: {
  ownerId: string;
  secret: string;
}): Promise<string> {
  const body = JSON.stringify({ ...payload, iat: Date.now() });
  const payloadB64 = btoa(body);
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyMfaSetupToken(token: string): Promise<{
  ownerId: string;
  secret: string;
} | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    payload = atob(payloadB64);
    const raw = atob(sigB64);
    sig = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sig[i] = raw.charCodeAt(i);
  } catch {
    return null;
  }
  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;
  try {
    const parsed = JSON.parse(payload) as {
      ownerId: string;
      secret: string;
      iat: number;
    };
    if (!parsed.ownerId || !parsed.secret) return null;
    if (Date.now() - parsed.iat > MFA_SETUP_TTL_MS) return null;
    return { ownerId: parsed.ownerId, secret: parsed.secret };
  } catch {
    return null;
  }
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    payload = atob(payloadB64);
    const raw = atob(sigB64);
    sig = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sig[i] = raw.charCodeAt(i);
  } catch {
    return null;
  }
  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;
  try {
    const parsed = JSON.parse(payload) as SessionPayload;
    if (Date.now() - parsed.iat > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function signMfaToken(ownerId: string): Promise<string> {
  const payload = JSON.stringify({ ownerId, iat: Date.now() });
  const payloadB64 = btoa(payload);
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyMfaToken(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payload: string;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    payload = atob(payloadB64);
    const raw = atob(sigB64);
    sig = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sig[i] = raw.charCodeAt(i);
  } catch {
    return null;
  }
  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;
  try {
    const parsed = JSON.parse(payload) as { ownerId: string; iat: number };
    if (Date.now() - parsed.iat > MFA_TTL_MS) return null;
    return parsed.ownerId;
  } catch {
    return null;
  }
}

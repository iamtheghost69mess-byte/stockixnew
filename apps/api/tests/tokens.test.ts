/**
 * Security tests for signSessionToken / verifySessionToken and MFA equivalents.
 *
 * The token module reads `apiConfig.authTokenSecret`, which in turn reads
 * process.env.AUTH_TOKEN_SECRET (with SESSION_SECRET as a fallback).
 * We control the secret by setting process.env before importing the module
 * and by resetting between test groups that need different secrets.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A sufficiently long secret that satisfies the >=16-char guard in secretOrThrow().
const VALID_SECRET = "super-secret-key-for-tests-only-32chars!!";

// Helper: mutate process.env and reset the module registry so each import
// sees a fresh apiConfig snapshot.
function setSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.SESSION_SECRET;
  } else {
    process.env.AUTH_TOKEN_SECRET = value;
  }
}

// A valid UUID for use in session token payloads (sub must be UUID per schema).
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe.sequential("signSessionToken + verifySessionToken", () => {
  beforeEach(() => {
    setSecret(VALID_SECRET);
    // Reset module cache so @repo/config re-reads process.env for each group.
    vi.resetModules();
  });

  afterEach(() => {
    setSecret(VALID_SECRET);
    vi.resetModules();
  });

  it("round-trip: sign then verify returns the original payload", async () => {
    const { signSessionToken, verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const input = {
      sub: VALID_UUID,
      role: "super_admin",
      email: "admin@example.com",
      name: "Admin User",
      sessionVersion: 1,
    };

    const token = await signSessionToken(input);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const result = await verifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe(input.sub);
    expect(result?.role).toBe(input.role);
    expect(result?.email).toBe(input.email);
    expect(result?.name).toBe(input.name);
    expect(result?.sessionVersion).toBe(input.sessionVersion);
    expect(typeof result?.iat).toBe("number");
  });

  it("tampered signature: flipping one character in the token returns null", async () => {
    const { signSessionToken, verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const token = await signSessionToken({
      sub: VALID_UUID,
      role: "read_only",
      email: "user@example.com",
      name: "User",
      sessionVersion: 0,
    });

    // Tamper the encoded payload segment so HMAC verification must fail.
    const dot = token.lastIndexOf(".");
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const flippedChar = encoded[encoded.length - 1] === "A" ? "B" : "A";
    const tamperedToken = encoded.slice(0, -1) + flippedChar + "." + sig;

    const result = await verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("expired session token (iat set 31 days ago) returns null", async () => {
    const { signSessionToken, verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );

    // Sign a legitimate token to get a well-formed structure, then backdate the iat.
    const token = await signSessionToken({
      sub: VALID_UUID,
      role: "super_admin",
      email: "admin@example.com",
      name: "Admin",
      sessionVersion: 1,
    });

    // Decode the payload, backdate iat by 31 days, and re-sign with the same secret.
    const dot = token.lastIndexOf(".");
    const encoded = token.slice(0, dot);
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    body.iat = Date.now() - 31 * 24 * 60 * 60 * 1000;

    const newBody = JSON.stringify(body);
    const newEncoded = Buffer.from(newBody, "utf8").toString("base64url");

    // We need to re-sign with the real HMAC. Import the sign helpers indirectly
    // by building a fresh token from the backdated body. Because signSessionToken
    // always stamps iat = Date.now(), we craft the raw token manually instead.
    //
    // Strategy: produce a token whose payload encodes an old iat but whose
    // signature is valid. We do this by calling the internal HMAC via crypto.subtle
    // directly, using the same secret and algorithm that tokens.ts uses.
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(VALID_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(newBody),
    );
    const newSig = Buffer.from(new Uint8Array(sigBytes)).toString("base64url");
    const expiredToken = `${newEncoded}.${newSig}`;

    const result = await verifySessionToken(expiredToken);
    expect(result).toBeNull();
  });

  it("empty string token returns null", async () => {
    const { verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );
    const result = await verifySessionToken("");
    expect(result).toBeNull();
  });

  it("token with no dot separator returns null", async () => {
    const { verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );
    // A string with no dot — the parser should return null at the dot-index guard.
    const result = await verifySessionToken("nodotinthisstring");
    expect(result).toBeNull();
  });

  it("malformed (garbage base64url payload) token returns null", async () => {
    const { verifySessionToken } = await import(
      "../src/services/auth/tokens.js"
    );
    // Valid base64url characters but the decoded JSON is not a valid payload.
    const fakeEncoded = Buffer.from("!!!not-json!!!").toString("base64url");
    const fakeSig = "AAAAAAAAAAAAAAAAAAAAAA";
    const result = await verifySessionToken(`${fakeEncoded}.${fakeSig}`);
    expect(result).toBeNull();
  });

  it("token signed with a different secret returns null when verified with the real secret", async () => {
    // Sign with a different secret by temporarily swapping the env variable.
    process.env.AUTH_TOKEN_SECRET = "different-secret-key-at-least-16c!";
    vi.resetModules();
    const { signSessionToken: signWithOther } = await import(
      "../src/services/auth/tokens.js"
    );
    const tokenFromOtherSecret = await signWithOther({
      sub: VALID_UUID,
      role: "super_admin",
      email: "admin@example.com",
      name: "Admin",
      sessionVersion: 1,
    });

    // Restore the original secret and re-import.
    process.env.AUTH_TOKEN_SECRET = VALID_SECRET;
    vi.resetModules();
    const { verifySessionToken: verifyWithReal } = await import(
      "../src/services/auth/tokens.js"
    );

    const result = await verifyWithReal(tokenFromOtherSecret);
    expect(result).toBeNull();
  });

  it("very short secret (< 16 chars) causes secretOrThrow to throw on sign", async () => {
    process.env.AUTH_TOKEN_SECRET = "tooshort";
    vi.resetModules();
    const { signSessionToken } = await import(
      "../src/services/auth/tokens.js"
    );

    await expect(
      signSessionToken({
        sub: VALID_UUID,
        role: "super_admin",
        email: "admin@example.com",
        name: "Admin",
        sessionVersion: 1,
      }),
    ).rejects.toThrow();
  });

  it("missing AUTH_TOKEN_SECRET and SESSION_SECRET causes secretOrThrow to throw on sign", async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.SESSION_SECRET;
    vi.resetModules();
    const { signSessionToken } = await import(
      "../src/services/auth/tokens.js"
    );

    await expect(
      signSessionToken({
        sub: VALID_UUID,
        role: "super_admin",
        email: "admin@example.com",
        name: "Admin",
        sessionVersion: 1,
      }),
    ).rejects.toThrow();
  });
});

describe.sequential("signMfaToken + verifyMfaToken", () => {
  beforeEach(() => {
    setSecret(VALID_SECRET);
    vi.resetModules();
  });

  afterEach(() => {
    setSecret(VALID_SECRET);
    vi.resetModules();
  });

  it("round-trip: sign then verify returns the original ownerId", async () => {
    const { signMfaToken, verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const ownerId = "owner-abc-123";
    const token = await signMfaToken(ownerId);
    expect(typeof token).toBe("string");

    const result = await verifyMfaToken(token);
    expect(result).toBe(ownerId);
  });

  it("tampered MFA token signature returns null", async () => {
    const { signMfaToken, verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const token = await signMfaToken("owner-xyz");
    const dot = token.lastIndexOf(".");
    const invalidSig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const tampered = `${token.slice(0, dot + 1)}${invalidSig}`;

    expect(await verifyMfaToken(tampered)).toBeNull();
  });

  it("tampered MFA token payload returns null", async () => {
    const { signMfaToken, verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const token = await signMfaToken("owner-xyz");
    const dot = token.lastIndexOf(".");
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const flippedChar = encoded[encoded.length - 1] === "A" ? "B" : "A";
    const tampered = encoded.slice(0, -1) + flippedChar + "." + sig;

    expect(await verifyMfaToken(tampered)).toBeNull();
  });

  it("truncated MFA token (missing signature) returns null", async () => {
    const { signMfaToken, verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const token = await signMfaToken("owner-xyz");
    const dot = token.lastIndexOf(".");
    const truncated = `${token.slice(0, dot)}.`;

    expect(await verifyMfaToken(truncated)).toBeNull();
  });

  it("expired MFA token (iat set 6 minutes ago) returns null", async () => {
    // MFA TTL is 5 minutes (5 * 60 * 1000 ms).
    const { verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );

    const ownerId = "owner-expired";
    const body = JSON.stringify({ ownerId, iat: Date.now() - 6 * 60 * 1000 });
    const encoded = Buffer.from(body, "utf8").toString("base64url");

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(VALID_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const sig = Buffer.from(new Uint8Array(sigBytes)).toString("base64url");
    const expiredToken = `${encoded}.${sig}`;

    expect(await verifyMfaToken(expiredToken)).toBeNull();
  });

  it("empty string MFA token returns null", async () => {
    const { verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );
    expect(await verifyMfaToken("")).toBeNull();
  });

  it("MFA token with no dot returns null", async () => {
    const { verifyMfaToken } = await import(
      "../src/services/auth/tokens.js"
    );
    expect(await verifyMfaToken("nodothere")).toBeNull();
  });
});

#!/usr/bin/env node

/**
 * Full local provisioning verification.
 *
 * - Authenticates with platform admin credentials from root .env
 * - Executes provision-diagnose in --full mode with auth cookie
 * - Exits non-zero on any provisioning failure/hang
 */

import process from "node:process";
import { execa } from "execa";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env" });

const API_URL = (process.env.STOCKIX_API_URL || "http://localhost:4000").replace(/\/$/, "");
const LOGIN_URL = `${API_URL}/auth/login`;
const email = process.env.PLATFORM_ADMIN_EMAIL || "";
const password = process.env.PLATFORM_ADMIN_PASSWORD || "";
const maxMs = process.env.PROVISION_MAX_MS || String(45 * 60 * 1000);
const pollMs = process.env.PROVISION_POLL_MS || "2000";
const staleMs = process.env.PROVISION_STALE_MS || "120000";

function fail(msg) {
  console.error(`\n[provision:test] ${msg}`);
  process.exit(1);
}

if (!email || !password) {
  fail("PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required in root .env");
}

async function loginAndGetSessionCookie() {
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer local-dev",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`login failed (${res.status}): ${text}`);
  }
  const setCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  const sessionCookie = setCookies
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .find((v) => v.startsWith("stockix-session="));
  if (!sessionCookie) {
    fail("login succeeded but session cookie was not returned");
  }
  return sessionCookie.split(";")[0];
}

async function run() {
  console.log("[provision:test] Starting local provisioning verification...");
  console.log(`[provision:test] API=${API_URL} maxMs=${maxMs} pollMs=${pollMs} staleMs=${staleMs}`);
  const cookie = await loginAndGetSessionCookie();
  await execa(
    "pnpm",
    [
      "--filter",
      "api",
      "exec",
      "node",
      "scripts/provision-diagnose.mjs",
      "--",
      "--full",
      "--max-ms",
      maxMs,
      "--poll-ms",
      pollMs,
      "--stale-ms",
      staleMs,
    ],
    {
      env: {
        ...process.env,
        PROVISION_COOKIE: cookie,
      },
      stdio: "inherit",
    },
  );
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

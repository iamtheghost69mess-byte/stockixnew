import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env", override: true });
loadEnv({ path: "apps/api/.env", override: true });

const platformSecret = process.env.PLATFORM_API_SECRET;
const apiBase = process.env.NEXT_PUBLIC_STOCKIX_API_URL ?? "http://127.0.0.1:4000";
const ownerId = process.env.SMOKE_OWNER_ID ?? "08f86b22-e474-4eae-8aa9-89cb76b77650";

if (!platformSecret) throw new Error("PLATFORM_API_SECRET is not set");
const key = `idem-smoke-${Date.now()}`;
const url = `${apiBase}/owners/${ownerId}`;
const payload = { name: "Smoke Idempotency Name" };
const changedPayload = { name: "Smoke Idempotency Name Changed" };
const headers = {
  "content-type": "application/json",
  "x-platform-api-key": platformSecret,
  "x-actor-id": ownerId,
  "idempotency-key": key,
};

const first = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify(payload),
});
const firstBody = await first.text();

const second = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify(payload),
});
const secondBody = await second.text();

const third = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify(changedPayload),
});
const thirdBody = await third.text();

console.log(
  JSON.stringify(
    {
      ownerId,
      key,
      first: { status: first.status, body: firstBody },
      second: { status: second.status, body: secondBody },
      third: { status: third.status, body: thirdBody },
    },
    null,
    2,
  ),
);

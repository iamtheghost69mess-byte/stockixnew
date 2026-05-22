#!/usr/bin/env node
/**
 * Phase 1 — Table floor API smoke (CRUD + new fields).
 *
 * Requires: MongoDB, running API, dev seed (`npm run seed:dev`).
 *
 *   API_BASE=http://127.0.0.1:8010 node scripts/table-floor-phase1-selftest.js
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";

async function login(pin) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pin: String(pin) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Login PIN ${pin}: ${r.status} ${j.message || JSON.stringify(j)}`);
  }
  const token = j.accessToken;
  if (!token) throw new Error("Login response missing accessToken");
  return token;
}

async function req(method, path, token, headersExtra, body) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...headersExtra,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let j = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    j = { raw: text };
  }
  return { status: r.status, json: j };
}

function assert(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok  ${name}`);
  return true;
}

async function main() {
  console.log(`table-floor phase1 selftest → ${BASE}\n`);

  let adminTok;
  try {
    adminTok = await login("1001");
  } catch (e) {
    console.error(e.message || e);
    console.error("\nStart the backend and run npm run seed:dev, or set API_BASE.");
    process.exit(1);
    return;
  }

  const locRes = await req("GET", "/api/locations", adminTok, {}, undefined);
  assert("admin can list locations", locRes.status === 200);
  const locations = Array.isArray(locRes.json.data) ? locRes.json.data : [];
  assert("at least one location exists for dev org", locations.length >= 1);
  const locId = locations[0]._id;
  const xh = { "X-Location-Id": String(locId) };

  const createBody = {
    seats: 3,
    name: "Phase1 API Table",
    pricePerPerson: 11.5,
    reservatorName: "Test Guest",
    reservatorPhone: "+15550001111",
    reservatorIsVip: true,
    personsSeated: 0,
    status: "reserved",
    floorAnchorX: 0.2,
    floorAnchorY: 0.35,
  };

  const created = await req("POST", "/api/table", adminTok, xh, createBody);
  assert("POST /api/table creates with floor fields", created.status === 201);
  const row = created.json.data;
  assert("response has _id", row && row._id);
  assert("response name matches", row.name === "Phase1 API Table");
  assert("response pricePerPerson", Number(row.pricePerPerson) === 11.5);
  assert("response reservatorIsVip", row.reservatorIsVip === true);
  assert("response status is reserved", row.status === "reserved");
  assert("response floorAnchorX", Number(row.floorAnchorX) === 0.2);
  assert("response floorAnchorY", Number(row.floorAnchorY) === 0.35);

  const id = row._id;

  const list = await req("GET", "/api/table", adminTok, xh, undefined);
  assert("GET /api/table lists new table", list.status === 200);
  const arr = Array.isArray(list.json.data) ? list.json.data : [];
  assert("list contains created id", arr.some((t) => String(t._id) === String(id)));

  const upd = await req(
    "PUT",
    `/api/table/${id}`,
    adminTok,
    {},
    {
      personsSeated: 2,
      status: "occupied",
      pricePerPerson: 12,
      floorAnchorX: 0.88,
      floorAnchorY: 0.12,
    },
  );
  assert("PUT updates persons and status", upd.status === 200);
  assert("updated personsSeated", Number(upd.json.data.personsSeated) === 2);
  assert("updated status occupied", upd.json.data.status === "occupied");
  assert("PUT updates floor anchors", Number(upd.json.data.floorAnchorX) === 0.88);

  const del = await req("DELETE", `/api/table/${id}`, adminTok, {}, undefined);
  assert("DELETE removes table", del.status === 200);

  const gone = await req("GET", `/api/table/${id}`, adminTok, {}, undefined);
  assert("GET after delete is 404", gone.status === 404);

  if (process.exitCode) {
    console.error("\nSome checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll table-floor phase1 selftest checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

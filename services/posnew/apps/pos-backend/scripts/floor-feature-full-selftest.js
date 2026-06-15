#!/usr/bin/env node
/**
 * Floor feature — HTTP self-test (tables API, anchors, RBAC, alias path).
 *
 * Covers:
 *   - Login, X-Location-Id, GET list (/api/table + /api/tables)
 *   - POST with floorAnchorX/Y, GET by id, PUT anchor updates, normalization (clamp), clear null
 *   - DELETE
 *   - Role without table write cannot POST (kitchen)
 *
 * Ephemeral table numbers **9200–9210** are cleaned at start and end (admin).
 *
 * Optional rich data for manual UI checks:
 *   npm run seed:floor-plan
 *
 *   API_BASE=http://127.0.0.1:8010 node scripts/floor-feature-full-selftest.js
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";

const TEST_TABLE_NO_MIN = 9200;
const TEST_TABLE_NO_MAX = 9210;

async function login(pin) {
  let r;
  try {
    r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ pin: String(pin) }),
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`Login fetch failed (${BASE}): ${msg}`);
  }
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

async function listTableIdsInRange(token, xh, minNo, maxNo) {
  const list = await req("GET", "/api/table", token, xh, undefined);
  if (list.status !== 200) return { error: list, ids: [] };
  const arr = Array.isArray(list.json.data) ? list.json.data : [];
  const ids = arr
    .filter((t) => {
      const n = Number(t.tableNo);
      return Number.isFinite(n) && n >= minNo && n <= maxNo;
    })
    .map((t) => String(t._id));
  return { error: null, ids };
}

async function deleteTablesByIds(token, ids) {
  for (const id of ids) {
    const del = await req("DELETE", `/api/table/${id}`, token, {}, undefined);
    if (del.status !== 200) {
      console.warn(`warn: DELETE /api/table/${id} → ${del.status}`);
    }
  }
}

async function main() {
  console.log(`floor-feature full selftest → ${BASE}\n`);

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

  const pre = await listTableIdsInRange(adminTok, xh, TEST_TABLE_NO_MIN, TEST_TABLE_NO_MAX);
  assert("preflight list tables", pre.error == null);
  await deleteTablesByIds(adminTok, pre.ids);

  const createBody = {
    tableNo: 9201,
    seats: 4,
    name: "FloorSelftest: anchored",
    status: "free",
    personsSeated: 0,
    pricePerPerson: 10,
    floorAnchorX: 0.31,
    floorAnchorY: 0.42,
  };

  const created = await req("POST", "/api/table", adminTok, xh, createBody);
  assert("POST /api/table accepts floor anchors", created.status === 201);
  const row = created.json.data;
  assert("created row has _id", row && row._id);
  assert("floorAnchorX round-trip", Number(row.floorAnchorX) === 0.31);
  assert("floorAnchorY round-trip", Number(row.floorAnchorY) === 0.42);
  const id = row._id;

  const byId = await req("GET", `/api/table/${id}`, adminTok, {}, undefined);
  assert("GET /api/table/:id returns anchors", byId.status === 200);
  assert("GET anchor X", Number(byId.json.data.floorAnchorX) === 0.31);

  const listAlias = await req("GET", "/api/tables", adminTok, xh, undefined);
  assert("GET /api/tables lists same tenant tables", listAlias.status === 200);
  const listArr = Array.isArray(listAlias.json.data) ? listAlias.json.data : [];
  assert("alias list contains created id", listArr.some((t) => String(t._id) === String(id)));

  const putClamp = await req("PUT", `/api/table/${id}`, adminTok, {}, {
    floorAnchorX: 0,
    floorAnchorY: 1,
  });
  assert("PUT clamps anchors into valid range", putClamp.status === 200);
  assert("clamped X is 0.02", Number(putClamp.json.data.floorAnchorX) === 0.02);
  assert("clamped Y is 0.98", Number(putClamp.json.data.floorAnchorY) === 0.98);

  const putClear = await req("PUT", `/api/table/${id}`, adminTok, {}, {
    floorAnchorX: null,
    floorAnchorY: null,
  });
  assert("PUT clears anchors with null", putClear.status === 200);
  const cleared = putClear.json.data;
  assert("floorAnchorX null after clear", cleared.floorAnchorX === null || cleared.floorAnchorX === undefined);
  assert("floorAnchorY null after clear", cleared.floorAnchorY === null || cleared.floorAnchorY === undefined);

  const putRestore = await req("PUT", `/api/table/${id}`, adminTok, {}, {
    floorAnchorX: 0.55,
    floorAnchorY: 0.6,
  });
  assert("PUT restores anchors", putRestore.status === 200);
  assert("restored X", Number(putRestore.json.data.floorAnchorX) === 0.55);

  let kitchenTok;
  try {
    kitchenTok = await login("1005");
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
  if (kitchenTok) {
    const kitchenPost = await req("POST", "/api/table", kitchenTok, xh, {
      tableNo: 9202,
      seats: 2,
      name: "FloorSelftest: kitchen should fail",
    });
    assert("kitchen cannot POST table (403)", kitchenPost.status === 403);
  }

  const del = await req("DELETE", `/api/table/${id}`, adminTok, {}, undefined);
  assert("DELETE removes test table", del.status === 200);

  const postCleanup = await listTableIdsInRange(adminTok, xh, TEST_TABLE_NO_MIN, TEST_TABLE_NO_MAX);
  await deleteTablesByIds(adminTok, postCleanup.ids);

  if (process.exitCode) {
    console.error("\nSome checks failed.");
    process.exit(1);
  } else {
    console.log("\nAll floor-feature full selftest checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

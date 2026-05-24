/**
 * Smoke-test platform and health endpoints against a running server.
 * Start API first: `JWT_SECRET=... PLATFORM_JWT_SECRET=... npm start`
 *
 * Env:
 *   PLATFORM_SELFTEST_BASE_URL (default http://127.0.0.1:8010)
 *   PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_PASSWORD — optional; skips authenticated tests if unset
 */
const BASE =
  process.env.PLATFORM_SELFTEST_BASE_URL || "http://127.0.0.1:8010";

async function req(method, path, { headers, body, query } = {}) {
  const u = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => u.searchParams.set(k, v));
  }
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(u, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* text responses */
  }
  return { res, json };
}

async function main() {
  const failures = [];

  const h = await req("GET", "/health");
  if (!h.json?.ok) failures.push("/health");

  const r = await req("GET", "/ready");
  if (!r.json?.ok && r.res.status !== 200) {
    failures.push("/ready (optional redis may fail)");
  }

  const oa = await req("GET", "/api/platform/v1/openapi.json");
  if (!oa.json?.openapi && !oa.json?.paths) failures.push("openapi.json");

  let accessToken = null;
  const em = process.env.PLATFORM_OWNER_EMAIL;
  const pw = process.env.PLATFORM_OWNER_PASSWORD;
  if (em && pw) {
    const lg = await req("POST", "/api/platform/v1/auth/login", {
      body: { email: em, password: pw },
    });
    const setCookies =
      typeof lg.res.headers.getSetCookie === "function"
        ? lg.res.headers.getSetCookie()
        : [];
    const prefix = "platformAccessToken=";
    for (const line of setCookies) {
      if (String(line).startsWith(prefix)) {
        accessToken = String(line).slice(prefix.length).split(";")[0] || null;
        break;
      }
    }
    if (!accessToken) failures.push("platform login (no platformAccessToken cookie)");
  }

  const auth = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  if (accessToken) {
    const orgSlug = `st-${Date.now()}`;
    const cr = await req("POST", "/api/platform/v1/organizations", {
      headers: {
        ...auth,
        "Idempotency-Key": `idem-${orgSlug}`,
      },
      body: { name: "Selftest Org", slug: orgSlug },
    });
    if (!cr.json?.success) failures.push("POST /organizations");
    const orgId = cr.json?.data?._id;
    if (orgId) {
      const g = await req("GET", `/api/platform/v1/organizations/${orgId}`, {
        headers: auth,
      });
      if (!g.json?.success) failures.push("GET /organizations/:id");
      const met = await req("GET", "/api/platform/v1/metrics/summary", {
        headers: auth,
      });
      if (!met.json?.success) failures.push("metrics/summary");
      const fl = await req(
        "GET",
        "/api/platform/v1/flags/evaluate",
        { headers: auth, query: { key: "test_flag" } }
      );
      if (fl.json?.success !== true) failures.push("flags/evaluate");
    }
  }

  if (failures.length) {
    console.error("FAIL:", failures.join(", "));
    process.exit(1);
  }
  console.log("platform-api-selftest: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

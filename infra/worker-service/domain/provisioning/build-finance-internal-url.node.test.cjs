const test = require("node:test");
const assert = require("node:assert/strict");

function buildUrl(slug, internalPort) {
  const template = process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE?.trim();
  if (template) {
    const host = process.env.POS_FINANCE_INTERNAL_HOST?.trim() || "host.docker.internal";
    return template
      .replace(/\{slug\}/g, slug)
      .replace(/\{port\}/g, String(internalPort))
      .replace(/\{host\}/g, host);
  }
  if (
    process.env.POS_FINANCE_USE_TRAEFIK_URL === "1"
    || process.env.POS_FINANCE_USE_TRAEFIK_URL === "true"
  ) {
    const rootDomain = process.env.ROOT_DOMAIN || "example.com";
    const scheme = process.env.PUBLIC_BASE_URL_SCHEME || "https";
    return `${scheme}://${slug}.${rootDomain}`;
  }
  const host = process.env.POS_FINANCE_INTERNAL_HOST?.trim() || "host.docker.internal";
  return `http://${host}:${internalPort}`;
}

test("buildFinanceInternalUrlForPos contract — host gateway default", () => {
  delete process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE;
  delete process.env.POS_FINANCE_USE_TRAEFIK_URL;
  delete process.env.POS_FINANCE_INTERNAL_HOST;
  assert.equal(buildUrl("acme", 4101), "http://host.docker.internal:4101");
});

test("buildFinanceInternalUrlForPos contract — custom host", () => {
  process.env.POS_FINANCE_INTERNAL_HOST = "172.17.0.1";
  assert.equal(buildUrl("acme", 5999), "http://172.17.0.1:5999");
});

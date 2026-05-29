const test = require("node:test");
const assert = require("node:assert/strict");

const revealPath = require.resolve("../../services/bootstrapCredentialReveal");
const configPath = require.resolve("../../config/config");

function loadReveal() {
  process.env.REDIS_URL = "";
  delete require.cache[configPath];
  delete require.cache[revealPath];
  return require("../../services/bootstrapCredentialReveal");
}

test("peekFullCredentials does not delete stored credentials", async () => {
  const { storeFullCredentials, peekFullCredentials, consumeFullCredentials } =
    loadReveal();
  const orgId = "507f1f77bcf86cd799439011";
  const payload = [{ role: "admin", username: "admin", pin: "123456" }];
  await storeFullCredentials(orgId, payload);
  const first = await peekFullCredentials(orgId);
  const second = await peekFullCredentials(orgId);
  assert.deepEqual(first, payload);
  assert.deepEqual(second, payload);
  const consumed = await consumeFullCredentials(orgId);
  assert.deepEqual(consumed, payload);
  assert.equal(await peekFullCredentials(orgId), null);
});

test("consumeFullCredentials removes credentials after read", async () => {
  const { storeFullCredentials, consumeFullCredentials } = loadReveal();
  const orgId = "507f1f77bcf86cd799439012";
  await storeFullCredentials(orgId, [{ role: "cashier", username: "cashier", pin: "654321" }]);
  const once = await consumeFullCredentials(orgId);
  assert.equal(once?.[0]?.pin, "654321");
  assert.equal(await consumeFullCredentials(orgId), null);
});

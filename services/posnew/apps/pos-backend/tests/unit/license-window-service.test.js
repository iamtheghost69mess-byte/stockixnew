const test = require("node:test");
const assert = require("node:assert/strict");

function loadServiceWithMode(mode) {
  process.env.LICENSE_ENFORCEMENT_MODE = mode;
  delete require.cache[require.resolve("../../config/config")];
  delete require.cache[require.resolve("../../services/licenseWindowService")];
  // eslint-disable-next-line global-require
  return require("../../services/licenseWindowService");
}

test("evaluateLicenseWindow returns ok inside range", () => {
  const { evaluateLicenseWindow } = loadServiceWithMode("enforce");
  const now = new Date("2026-01-10T10:00:00.000Z");
  const result = evaluateLicenseWindow(
    {
      timezone: "Asia/Beirut",
      licenseStartDate: "2026-01-01T00:00:00.000Z",
      licenseEndDate: "2026-12-31T23:59:59.000Z",
    },
    now
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, null);
});

test("evaluateLicenseWindow returns LICENSE_NOT_STARTED before start", () => {
  const { evaluateLicenseWindow } = loadServiceWithMode("enforce");
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = evaluateLicenseWindow(
    {
      timezone: "Asia/Beirut",
      licenseStartDate: "2026-02-01T00:00:00.000Z",
      licenseEndDate: "2026-12-31T23:59:59.000Z",
    },
    now
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "LICENSE_NOT_STARTED");
});

test("evaluateLicenseWindow returns LICENSE_EXPIRED after end", () => {
  const { evaluateLicenseWindow } = loadServiceWithMode("enforce");
  const now = new Date("2026-12-31T23:59:59.999Z");
  const result = evaluateLicenseWindow(
    {
      timezone: "Asia/Beirut",
      licenseStartDate: "2026-01-01T00:00:00.000Z",
      licenseEndDate: "2026-01-31T23:59:59.000Z",
    },
    now
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "LICENSE_EXPIRED");
});

test("enforceOrShadowLicenseWindow throws in enforce mode", () => {
  const { enforceOrShadowLicenseWindow } = loadServiceWithMode("enforce");
  assert.throws(() => {
    enforceOrShadowLicenseWindow({
      organization: {
        timezone: "Asia/Beirut",
        licenseStartDate: "2026-03-01T00:00:00.000Z",
        licenseEndDate: "2026-03-31T23:59:59.000Z",
      },
    });
  });
});

test("enforceOrShadowLicenseWindow does not throw in shadow mode", () => {
  const { enforceOrShadowLicenseWindow } = loadServiceWithMode("shadow");
  assert.doesNotThrow(() => {
    enforceOrShadowLicenseWindow({
      organization: {
        timezone: "Asia/Beirut",
        licenseStartDate: "2099-03-01T00:00:00.000Z",
        licenseEndDate: "2099-03-31T23:59:59.000Z",
      },
    });
  });
});

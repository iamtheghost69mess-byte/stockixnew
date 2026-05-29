/**
 * One-off: create parent org "jad" and sub-org "jad2" in Stockix Finance only.
 * Usage: FINANCE_PROVISION_SECRET=... FINANCE_PROVISION_PASSWORD=... node scripts/provision-jad-orgs.mjs
 */
if (!process.env.FINANCE_PROVISION_SECRET || !process.env.FINANCE_PROVISION_PASSWORD) {
  console.error('FINANCE_PROVISION_SECRET and FINANCE_PROVISION_PASSWORD must be set in environment');
  process.exit(1);
}

// Finance API via tenant nginx (dajo stack). Override: FINANCE_API_URL=http://...
const BASE = (process.env.FINANCE_API_URL || 'http://127.0.0.1:4102').replace(/\/+$/, '');
const SECRET = process.env.FINANCE_PROVISION_SECRET;
const EMAIL = 'jad@jad.stockix.local';
const PASSWORD = process.env.FINANCE_PROVISION_PASSWORD;
const PARENT_NAME = 'jad';
const SUB_NAME = 'jad2';

const BUILD_SETTINGS = {
  name: PARENT_NAME,
  location: 'LB',
  baseCurrency: 'USD',
  timezone: 'Asia/Beirut',
  fiscalYear: 'january',
  language: 'en',
  dateFormat: 'MM/DD/yyyy',
};

function log(msg) {
  console.log(msg);
}

function pickAuth(body) {
  return {
    accessToken:
      body.accessToken ?? body.access_token ?? body.token ?? '',
    organizationId: body.organizationId ?? body.organization_id ?? '',
    tenantId: Number(body.tenantId ?? body.tenant_id ?? 0),
    userId: Number(body.userId ?? body.user_id ?? 0),
  };
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function provisionUser() {
  const { ok, status, body, text } = await jsonFetch(`${BASE}/api/internal/provision-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': SECRET,
    },
    body: JSON.stringify({
      email: EMAIL,
      first_name: 'Jad',
      last_name: 'Admin',
      password: PASSWORD,
      role: 'admin',
    }),
  });
  if (!ok) throw new Error(`provision-user failed ${status}: ${text.slice(0, 500)}`);
  const auth = pickAuth(body);
  if (!auth.tenantId || !auth.organizationId) {
    throw new Error('provision-user missing ids');
  }
  return { tenantId: auth.tenantId, organizationId: auth.organizationId };
}

async function signin() {
  const { ok, status, body, text } = await jsonFetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!ok) throw new Error(`signin failed ${status}: ${text.slice(0, 500)}`);
  return pickAuth(body);
}

async function switchTenant(accessToken, organizationId) {
  const { ok, status, body, text } = await jsonFetch(`${BASE}/api/auth/switch-tenant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ organizationId }),
  });
  if (!ok) throw new Error(`switch-tenant failed ${status}: ${text.slice(0, 500)}`);
  return pickAuth(body);
}

async function currentBuilt(accessToken, organizationId) {
  const { ok, body } = await jsonFetch(`${BASE}/api/organization/current`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'organization-id': organizationId,
    },
  });
  if (!ok) return false;
  const builtAt = body.builtAt ?? body.built_at;
  return builtAt != null && builtAt !== '';
}

async function buildOrg(accessToken, organizationId, name) {
  if (await currentBuilt(accessToken, organizationId)) {
    log(`  already built: ${name}`);
    return;
  }
  const settings = { ...BUILD_SETTINGS, name };
  const { ok, status, body, text } = await jsonFetch(`${BASE}/api/organization/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'organization-id': organizationId,
    },
    body: JSON.stringify(settings),
  });
  if (!ok && !String(text).includes('TENANT_ALREADY_BUILT')) {
    throw new Error(`build failed ${status}: ${text.slice(0, 500)}`);
  }
  const jobId = body?.data?.jobId ?? body?.data?.job_id;
  const deadline = Date.now() + 180_000;
  await sleep(5000);
  while (Date.now() < deadline) {
    if (await currentBuilt(accessToken, organizationId)) {
      log(`  built: ${name}`);
      return;
    }
    if (jobId) {
      const poll = await jsonFetch(
        `${BASE}/api/organization/build/${encodeURIComponent(jobId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'organization-id': organizationId,
          },
        },
      );
      const st = poll.body?.state;
      if (poll.body?.isFailed || st === 'failed') {
        throw new Error(`build job failed for ${name}`);
      }
    }
    await sleep(8000);
  }
  throw new Error(`build timeout for ${name}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setParent(subTenantId, parentTenantId) {
  const { ok, status, text } = await jsonFetch(
    `${BASE}/api/internal/tenants/${subTenantId}/set-parent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': SECRET,
      },
      body: JSON.stringify({ parentTenantId }),
    },
  );
  if (!ok) throw new Error(`set-parent failed ${status}: ${text.slice(0, 300)}`);
}

async function copyFromParent(subTenantId, parentTenantId) {
  const { ok, status, text } = await jsonFetch(
    `${BASE}/api/internal/tenants/${subTenantId}/copy-from/${parentTenantId}`,
    {
      method: 'POST',
      headers: { 'x-internal-secret': SECRET },
    },
  );
  log(`  COA copy: ${ok ? 'ok' : `failed ${status}`} ${text.slice(0, 120)}`);
}

async function main() {
  log('=== Parent org: jad ===');
  const parentProvision = await provisionUser();
  log(`  tenantId=${parentProvision.tenantId} orgId=${parentProvision.organizationId}`);

  let session = await signin();
  session = await switchTenant(session.accessToken, parentProvision.organizationId);
  await buildOrg(session.accessToken, parentProvision.organizationId, PARENT_NAME);
  const parentTenantId = parentProvision.tenantId;

  log('=== Sub org: jad2 ===');
  const subProvision = await provisionUser();
  log(`  tenantId=${subProvision.tenantId} orgId=${subProvision.organizationId}`);

  session = await signin();
  const subSession = await switchTenant(session.accessToken, subProvision.organizationId);
  await buildOrg(subSession.accessToken, subProvision.organizationId, SUB_NAME);

  await setParent(subProvision.tenantId, parentTenantId);
  await copyFromParent(subProvision.tenantId, parentTenantId);

  log('\n=== DONE ===');
  log(`Finance UI: ${BASE}`);
  log(`Login URL: ${BASE}`);
  log(`Email: ${EMAIL}`);
  log(`Password: ${PASSWORD}`);
  log(`Parent org name: ${PARENT_NAME} (tenant ${parentTenantId})`);
  log(`Sub org name: ${SUB_NAME} (tenant ${subProvision.tenantId})`);
  log('Use organization switcher in Finance UI to pick jad vs jad2.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

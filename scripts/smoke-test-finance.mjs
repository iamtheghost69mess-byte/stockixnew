#!/usr/bin/env node
/**
 * Smoke-tests the running stockix-finance API.
 *
 * Usage:
 *   node scripts/smoke-test-finance.mjs --email user@example.com --password secret
 *   node scripts/smoke-test-finance.mjs --email user@example.com --password secret --base http://127.0.0.1:4112
 *
 * Exits 0 if all checks pass, 1 if any fail.
 */

const BASE_DEFAULT = 'http://127.0.0.1:4112/api';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email' && argv[i + 1]) args.email = argv[++i];
    else if (argv[i] === '--password' && argv[i + 1]) args.password = argv[++i];
    else if (argv[i] === '--base' && argv[i + 1]) args.base = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const BASE = (args.base || BASE_DEFAULT).replace(/\/$/, '');
const EMAIL = args.email;
const PASSWORD = args.password;

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m–\x1b[0m';

let passed = 0, failed = 0;

async function check(label, fn) {
  try {
    const result = await fn();
    if (result === false) {
      console.log(`  ${SKIP} ${label} (skipped)`);
    } else {
      console.log(`  ${PASS} ${label}`);
      passed++;
    }
  } catch (err) {
    console.log(`  ${FAIL} ${label}  →  ${err.message}`);
    failed++;
  }
}

async function get(token, path, allowedCodes = [200]) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!allowedCodes.includes(res.status)) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
  }
  return res;
}

// ─── Phase 1: public health ───────────────────────────────────────────────────
console.log('\n[1] Public endpoints');

let token = null;

await check('GET /ping → 200', async () => {
  const res = await get(null, '/ping');
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(`unexpected body: ${JSON.stringify(json)}`);
});

// ─── Phase 2: authentication ──────────────────────────────────────────────────
console.log('\n[2] Authentication');

if (!EMAIL || !PASSWORD) {
  console.log(`  ${SKIP} Login (no --email/--password provided — skipping authenticated tests)`);
} else {
  await check('POST /auth/login → 200 + token', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crediential: EMAIL, password: PASSWORD }),
    });
    if (res.status !== 200) {
      // Try alternate field name
      const res2 = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      });
      if (res2.status !== 200) {
        const body = await res2.text().catch(() => '');
        throw new Error(`HTTP ${res2.status} — ${body.slice(0, 120)}`);
      }
      const json = await res2.json();
      token = json.token || json.access_token || json.data?.token;
    } else {
      const json = await res.json();
      token = json.token || json.access_token || json.data?.token;
    }
    if (!token) throw new Error('No token in response');
  });
}

// ─── Phase 3: authenticated endpoints ────────────────────────────────────────
if (!token) {
  console.log('\n[3-7] Skipping authenticated checks (no token)');
} else {
  // Organization
  console.log('\n[3] Organization');
  await check('GET /organization/current → 200', () => get(token, '/organization/current'));

  // Master data
  console.log('\n[4] Master data');
  await check('GET /accounts → 200',       () => get(token, '/accounts'));
  await check('GET /items → 200',           () => get(token, '/items'));
  await check('GET /customers → 200',       () => get(token, '/customers'));
  await check('GET /vendors → 200',         () => get(token, '/vendors'));
  await check('GET /currencies → 200',      () => get(token, '/currencies'));
  await check('GET /exchange-rates → 200',  () => get(token, '/exchange-rates'));
  await check('GET /tax-rates → 200',       () => get(token, '/tax-rates'));
  await check('GET /branches → 200',        () => get(token, '/branches'));
  await check('GET /roles → 200',           () => get(token, '/roles'));
  await check('GET /users → 200',           () => get(token, '/users'));

  // Transactions
  console.log('\n[5] Transactions');
  await check('GET /sale-invoices → 200',   () => get(token, '/sale-invoices'));
  await check('GET /sale-estimates → 200',  () => get(token, '/sale-estimates'));
  await check('GET /sale-receipts → 200',   () => get(token, '/sale-receipts'));
  await check('GET /bills → 200',           () => get(token, '/bills'));
  await check('GET /bill-payments → 200',   () => get(token, '/bill-payments'));
  await check('GET /payments-received → 200', () => get(token, '/payments-received'));
  await check('GET /expenses → 200',        () => get(token, '/expenses'));
  await check('GET /manual-journals → 200', () => get(token, '/manual-journals'));
  await check('GET /credit-notes → 200',    () => get(token, '/credit-notes'));
  await check('GET /vendor-credits → 200',  () => get(token, '/vendor-credits'));

  // Financial Reports (table format)
  console.log('\n[6] Financial reports');
  const now = new Date().toISOString().split('T')[0];
  const jan1 = `${new Date().getFullYear()}-01-01`;
  const tableH = { Authorization: `Bearer ${token}`, Accept: 'application/json+table' };

  async function report(label, path) {
    await check(label, async () => {
      const res = await fetch(`${BASE}${path}`, { headers: tableH });
      if (![200, 204].includes(res.status)) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
      }
    });
  }

  await report('GET /reports/balance-sheet',           `/reports/balance-sheet?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/profit-loss-sheet',       `/reports/profit-loss-sheet?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/trial-balance-sheet',     `/reports/trial-balance-sheet?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/general-ledger',          `/reports/general-ledger?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/journal',                 `/reports/journal?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/cashflow-statement',      `/reports/cashflow-statement?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/inventory-valuation',     `/reports/inventory-valuation?date=${now}`);
  await report('GET /reports/inventory-item-details',  `/reports/inventory-item-details?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/sales-by-items',          `/reports/sales-by-items?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/purchases-by-items',      `/reports/purchases-by-items?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/receivable-aging-summary',`/reports/receivable-aging-summary?asDate=${now}`);
  await report('GET /reports/payable-aging-summary',   `/reports/payable-aging-summary?asDate=${now}`);
  await report('GET /reports/customer-balance-summary',`/reports/customer-balance-summary?asDate=${now}`);
  await report('GET /reports/vendor-balance-summary',  `/reports/vendor-balance-summary?asDate=${now}`);
  await report('GET /reports/transactions-by-customers',`/reports/transactions-by-customers?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/transactions-by-vendors', `/reports/transactions-by-vendors?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/sales-tax-liability-summary',`/reports/sales-tax-liability-summary?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/realized-gain-loss',      `/reports/realized-gain-loss?fromDate=${jan1}&toDate=${now}`);
  await report('GET /reports/unrealized-gain-loss',    `/reports/unrealized-gain-loss?fromDate=${jan1}&toDate=${now}`);

  // Dashboard
  console.log('\n[7] Dashboard');
  await check('GET /dashboard → 200', () => get(token, '/dashboard'));
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed === 0) {
  console.log('\x1b[32mAll checks passed ✓\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failed} check(s) failed\x1b[0m\n`);
  process.exit(1);
}

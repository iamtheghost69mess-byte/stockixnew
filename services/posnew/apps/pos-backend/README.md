# pos-backend

Express.js **tenant API** for the POS product: authentication, RBAC, catalog, tables/orders, kitchen, inventory, accounting, procurement hooks, printing, and public guest endpoints (e.g. self-order).

## Documentation

- **Architecture, module status, and route inventory:** [`../../SYSTEM_AUDIT_MASTER.md`](../../SYSTEM_AUDIT_MASTER.md)

Use that document for Accounting / Inventory / POS behavior, known integrity gaps (e.g. order `paid` vs GL posting), and mounted paths. OpenAPI specs live under `openapi/` (including `tenant-pos-v1.yaml`).

### Platform organizations (SaaS / internal)

- **Commercial license** (`licenseStartsAt`, `licenseEndsAt`): tenant-facing window. On **create org**, if the client omits these fields, the API sets **start = creation time** and **end = one calendar year later (UTC)**. They can still be cleared or overridden via `PATCH /organizations/:id/license`.
- **Entitlements** (`PATCH /organizations/:id/entitlements`): caps **`maxUsers`** and **`maxLocations`** cannot be set **below** the current live user count or location count (returns **400**).
- **Hostess (POS)**: new tenants get default bootstrap roles including **hostess** in default credentials. Orgs that already had users before that role existed are **not** auto-backfilled; add the user manually or run a one-off migration.

## Run locally

```bash
npm install   # from monorepo root, or here if workspace-aware
npm run dev   # nodemon app.js
```

Copy and edit environment variables from `.env.example`.

## Common scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API with nodemon |
| `npm run start` | Production-style `node app.js` |
| `npm test` | Unit + selected contract tests |
| `npm run migrate:schema` | Schema migrations helper |
| `npm run seed:dev` | Dev staff seed (see `scripts/`) |
| `npm run test:staff-entitlements` | Staff seat cap selftest (MongoDB; see **Testing** below) |

Workers (if you use them): `npm run worker:platform`, `npm run worker:print`.

## Testing

### Default unit and contract suite

```bash
npm test
```

Runs everything under `tests/unit/` (including `entitlement-max-users.test.js` for **`maxUsersFromEntitlements`**, and **`platform-org-patch-entitlements.test.js`** for PATCH entitlements cap guards) plus the OpenAPI contract tests listed in `package.json`.

### Staff / tenant seat cap (MongoDB)

Verifies that **`assertStaffCreateAllowed`** blocks new staff when the organization already has as many users as **`entitlements.maxUsers`** (including suspended users in the count).

```bash
# From apps/pos-backend (or via workspace: npm run test:staff-entitlements -w pos-backend)
RUN_STAFF_ENTITLEMENTS_SELFTEST=1 npm run test:staff-entitlements
```

- **Requires:** `MONGODB_URI` (see `.env.example`).
- **Behavior:** Creates a throwaway org with `maxUsers: 2`, inserts two PIN users, then expects a third `assertStaffCreateAllowed` call to fail with **403**. Without `RUN_STAFF_ENTITLEMENTS_SELFTEST=1`, the script exits **0** immediately (skip).

### Tenant isolation (optional, heavier)

Cross-tenant API checks; needs Mongo and env:

```bash
RUN_ISOLATION=1 npm run test:isolation
```

## Entry point

Application bootstrap and route mounting: `app.js`.

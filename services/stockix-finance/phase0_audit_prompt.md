# Phase 0 — Pre-Implementation Audit Prompt
# Paste into Cursor Agent Mode, root of `services/stockix-finance`
# Goal: produce `AUDIT.md` — a complete file-by-file inventory before any code is written

---

## Your role

You are a senior backend engineer auditing a NestJS + Knex + Objection.js monorepo
(a fork of Bigcapital v0.22.0) before implementing **Path A: Shared System DB**
for multi-org single-login support.

You will READ files, DOCUMENT what you find, and OUTPUT one file: `AUDIT.md`.
You will NOT write any implementation code.
You will NOT suggest fixes yet.
Every single claim in `AUDIT.md` must cite the exact file path + line number.
If a file does not exist, say so explicitly — do not guess or invent.

---

## STEP 1 — Map the directory structure first

Run the following and paste the output verbatim into AUDIT.md section 1:

```
find packages/server/src -type f -name "*.ts" | sort
find packages/server/src/database -type f | sort
find packages/webapp/src/hooks -type f | sort
find packages/webapp/src/store -type f | sort
find packages/webapp/src/containers/Dashboard/Sidebar -type f | sort
```

This gives us the real file tree — no assumptions.

---

## STEP 2 — Read and document these files in full

For each file below: read it completely, then in AUDIT.md write:
- Exact file path
- Total line count
- What the file does (2–3 sentences max)
- Every function/method name with its start line
- Every database table name it references
- Every import it pulls from other internal modules
- Any TODO, FIXME, or HACK comments found

### System DB — models

- `packages/server/src/modules/System/models/SystemUser.ts`
- `packages/server/src/modules/System/models/TenantModel.ts`
- `packages/server/src/modules/System/models/TenantMetadataModel.ts`
- Search for any other files matching `**/System/models/*.ts` and read them all

### System DB — database config & connection

- `packages/server/src/modules/System/SystemDatabase.ts`
  (or wherever the system Knex instance is configured — search for `system-database`, `systemKnex`, `SystemKnex`)
- The file that defines which MySQL host/database the system DB connects to
- Search for `knex({` or `Knex({` across all server files — read every match

### Migrations — system

- List every file under `packages/server/src/database/system/migrations/` with its filename and first 10 lines
- Note the exact naming convention (timestamp format, JS vs TS)
- Note which migration creates `users` and which creates `tenants`

### Migrations — tenant

- List every file under `packages/server/src/database/tenant/migrations/` (filenames only — do not read them all)
- Note naming convention differences vs system migrations

### Auth — backend (read every line)

- `packages/server/src/modules/Auth/Auth.controller.ts`
- `packages/server/src/modules/Auth/Authed.controller.ts`
- `packages/server/src/modules/Auth/Auth.module.ts`
- `packages/server/src/modules/Auth/commands/AuthSignup.service.ts`
- `packages/server/src/modules/Auth/commands/AuthSignin.service.ts`
- Search `packages/server/src/modules/Auth/` for any other `*.service.ts` files — read them all
- `packages/server/src/modules/Auth/Auth.interfaces.ts`
- `packages/server/src/modules/Auth/Jwt.strategy.ts`

For each file document:
- The exact JWT payload fields set in `signToken` (list every field explicitly)
- The exact CLS fields set in `verifyPayload` (list every `cls.set(...)` call)
- Every route decorator (`@Post`, `@Get`, etc.) with its exact path string

### Tenancy guard & CLS middleware

- Search for `TenancyGlobal` across all server files — read that file in full
- `packages/server/src/modules/App/App.module.ts`
  (read the entire `ClsModule.forRoot` block and document every `cls.set(...)` call)
- Search for `organization-id` (with the hyphen) across all server files
  — list every file that reads or writes this header/CLS key

### Environment & database config

- Search for `DB_HOST`, `SYSTEM_DB`, `DATABASE_URL`, `knex` in `.env.example` or any config file
- Read `packages/server/src/config/` directory if it exists
- Document exactly: what env vars control the system DB connection today

### Frontend — auth & state (read every line)

- `packages/webapp/src/hooks/query/authentication.tsx`
- `packages/webapp/src/hooks/state/authentication.tsx`
- `packages/webapp/src/store/authentication/authentication.reducer.tsx`
- `packages/webapp/src/hooks/useRequest.tsx`
- `packages/webapp/src/services/axios.tsx` (if exists)
- `packages/webapp/src/hooks/query/useStockixOrgs.tsx`
- `packages/webapp/src/containers/Dashboard/Sidebar/SidebarHead.tsx`

For each file document:
- Every cookie name read or written (exact string)
- Every Redux action dispatched on login / logout
- Every HTTP header set on outgoing requests
- Where `organization-id` is stored after login
- Where the JWT token is stored after login

---

## STEP 3 — Answer these specific questions (evidence required for every answer)

Write your answers in AUDIT.md section 3. Every answer needs file + line number.

**Q1.** What is the exact Knex connection config for the system DB?
- Which file builds the system Knex instance?
- What env vars does it read for host, port, database name, user, password?
- Is there a separate `systemDatabase` vs `tenantDatabase` Knex instance, or one shared?

**Q2.** Where exactly does the system DB `host` get set in Docker Compose or env?
- Is it `localhost`, a service name, or an env var?
- Can it be changed to point to an external shared DB without code changes, or does code need updating?

**Q3.** What is the exact shape of the object returned by `POST /auth/signin`?
- List every field in the response body (exact key names, snake_case vs camelCase)
- Which file serializes this response?

**Q4.** What does `setAuthLoginCookies` set exactly?
- List every cookie name with its exact string key
- What value goes into each cookie?
- Is there a cookie `domain` or `path` set?

**Q5.** After login, how does the frontend know which `organization-id` to send?
- Where is `organization_id` (or `organizationId`) stored?
- Which file reads it and attaches it to the `organization-id` header?
- Is this stored in a cookie, Redux, localStorage, or all three?

**Q6.** What guards/decorators are on each auth route?
- For each route in `Auth.controller.ts` and `Authed.controller.ts`, list:
  - HTTP method + path
  - Guard(s) applied
  - Whether it requires JWT
  - Whether it requires `organization-id` header

**Q7.** Does any existing code handle the concept of "a user belonging to multiple orgs"?
- Search for `userOrganizations`, `userTenants`, `memberships`, `organizations` (plural) across all server files
- Report every match with file + line

**Q8.** What happens if `organization-id` header is sent for a tenant the user does NOT belong to?
- Trace the request lifecycle: JWT verify → CLS → guard → DB query
- At what point (if any) is the user's ownership of that org verified?
- Is there any query that joins `users` to `tenants` to verify access?

**Q9.** What is the invite flow today?
- Which file creates an invited user?
- Does it create a new `users` row or reuse an existing one?
- What `tenantId` does it assign?

**Q10.** Are there any existing tests for auth?
- Search for `*.spec.ts` or `*.test.ts` files under `packages/server/src/modules/Auth/`
- List them with line counts
- Note what they cover

---

## STEP 4 — Produce the AUDIT.md file

Write the file at: `services/stockix-finance/AUDIT.md`

Use this exact structure:

```markdown
# AUDIT.md — Phase A Pre-Implementation Inventory
# Generated: [date]
# Audited by: Cursor Agent
# Codebase: services/stockix-finance (Bigcapital v0.22.0 fork)

---

## Section 1 — Real file tree (verbatim find output)

[paste find output here]

---

## Section 2 — File-by-file documentation

### [filename]
- **Path:** [exact path]
- **Lines:** [N]
- **Purpose:** [2–3 sentences]
- **Functions/methods:** [name → line N]
- **DB tables referenced:** [list]
- **Internal imports:** [list]
- **TODOs/FIXMEs:** [list or "none"]

[repeat for every file listed in Step 2]

---

## Section 3 — Question answers

### Q1. System DB Knex config
[answer with file:line citations]

### Q2. System DB host in Docker/env
[answer with file:line citations]

### Q3. POST /auth/signin response shape
[answer with file:line citations]

### Q4. setAuthLoginCookies — exact cookies
[answer with file:line citations]

### Q5. organization-id flow after login
[answer with file:line citations]

### Q6. Route guards inventory
| Route | Method | Guard | JWT required | org-id required |
|-------|--------|-------|-------------|-----------------|
[fill for every route]

### Q7. Existing multi-org code
[list every match or "no matches found"]

### Q8. Cross-tenant access — verification gap
[trace with file:line citations]

### Q9. Invite flow
[answer with file:line citations]

### Q10. Existing auth tests
[list or "none found"]

---

## Section 4 — Ready-state checklist

After reading everything, fill this in:

| Item | Status | File | Notes |
|------|--------|------|-------|
| System Knex config | [found / not found] | [path] | |
| System DB env vars documented | [yes / partial / no] | [path] | |
| users migration exists | [yes / no] | [path] | |
| tenants migration exists | [yes / no] | [path] | |
| user_tenants migration exists | [yes / no] | — | must create |
| UserTenant model exists | [yes / no] | — | must create |
| JWT payload has org fields | [yes / no] | [path] | |
| TenancyGlobal guard checks membership | [yes / no] | [path] | |
| switch-tenant route exists | [yes / no] | — | must create |
| my-tenants route exists | [yes / no] | — | must create |
| internal attach-user route exists | [yes / no] | — | must create |
| Frontend stores org-id in cookie | [yes / no] | [path] | |
| Frontend useSwitchTenant hook exists | [yes / no] | — | must create |
| SidebarHead uses API switch | [yes / no] | [path] | currently window.location |

---

## Section 5 — Blockers and open questions

List anything that MUST be decided before Phase 1 implementation begins.
Be specific — "unclear" is not acceptable. State exactly what is unknown and why it matters.
```

---

## Constraints for this audit

- Read every file listed before writing a single line of AUDIT.md
- Do not write implementation code anywhere
- Do not suggest changes — only document what exists
- If a glob finds more files than listed, read and document all of them
- If a file is missing, say "FILE NOT FOUND" in the relevant section — never skip silently
- The checklist in Section 4 must be fully filled — no empty cells
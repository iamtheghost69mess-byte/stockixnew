# INVEST.md — Tenant Detail Page Investigation Plan

**Reference tenant:** `http://localhost:3000/tenants/4f754320-9a3b-49b9-b184-73401adb46d4`  
**Scope:** Full audit of every feature section on the tenant detail view  
**Rule:** DO NOT ASSUME — verify every behavior in source code before reporting

---

## Investigation Areas

| # | Section | Key Questions | Risk Level |
|---|---------|--------------|------------|
| 1 | Branding | Who owns logo? Where do colors live? | Low |
| 2 | Sub-Org Rename | Does it touch slug/env/containers? | **P0 — Critical** |
| 3 | Add Organization | Does new org appear in dropdown? | Medium |
| 4 | Support Agent Access | Is cross-tenant scope enforced? | **P0 — Security** |
| 5 | Invite Finance User | Does invite reach Bigcapital? | Medium |
| 6 | License | Is it functional or placeholder? | Medium |

---

## 1. Branding

### What to find
- [x] Component file rendering the Branding section
- [x] API endpoint called on read and on save
- [x] Where logo is stored: DB column vs tenant `.env` vs Bigcapital config
- [x] Whether the Finance (Bigcapital) service reads branding from its own `.env` or from a shared source
- [x] Color field: is it in DB schema? Is the picker wired or disabled?
- [x] Current default color state (reported as black — verify this is intentional)

### Verification checklist
- [x] Trace `logo` save → backend handler → storage destination
- [x] Trace `color` field → backend handler → where it ends up
- [x] Confirm: does Bigcapital read logo from its `.env` at startup, or dynamically?
- [x] If colors are hardcoded as black default — confirm this is intentional and not a broken picker

### Expected output in audit
- Exact file:line for logo storage
- Exact file:line for color storage (or confirmation it is not implemented)
- Verdict: functional / partial / placeholder

---

## 2. Sub-Organization Rename

### Why this is P0
Renaming a provisioned tenant could silently affect:
- The slug used in subdomains (`slug.yourdomain.com`)
- Docker container names and network aliases
- `.env` file `APP_URL`, `FINANCE_URL`, `REDIS_PREFIX`, `DB_DATABASE` values
- JWT tenant claims if they embed the slug
- Traefik routing rules if they are slug-based

### What to find
- [x] The Rename UI component and what payload it sends
- [x] The backend rename endpoint — exact file:line
- [x] Every DB column updated on rename (name only? slug? both?)
- [x] Whether the `.env` file for the tenant is touched
- [x] Whether any container restart or re-provisioning is triggered
- [x] Whether there is a uniqueness check for the new name/slug
- [x] What happens on rename collision (duplicate slug)
- [x] Whether rename is blocked if tenant status is `active` / `provisioned`

### Verification checklist
- [x] Read the rename handler top to bottom — list every operation it performs
- [x] Check if slug is derived from name at rename time
- [x] Check if Traefik labels are static (set at provision time) or dynamic
- [x] Check if any background job re-reads tenant name/slug after rename
- [x] Confirm whether the frontend payload includes `slug` or only `name`

### Expected output in audit
- Full list of what rename currently touches
- Risk assessment: can renaming break a live tenant?
- Broken steps with file:line
- Whether the feature should be disabled pending a safe implementation

---

## 3. Add Organization

### What to find
- [x] The Add Organization form component
- [x] The creation API endpoint and backend handler
- [x] Whether creation triggers provisioning or is metadata-only
- [x] The dropdown component that lists organizations per tenant
- [x] What query/endpoint the dropdown uses to populate
- [x] Whether the dropdown re-fetches after a new org is created (or is stale)

### Verification checklist
- [x] Trace full creation flow: form submit → endpoint → DB → provisioning trigger (if any)
- [x] Confirm new org appears in switcher dropdown without a page reload
- [x] Check for missing error handling if org name conflicts with existing

### Expected output in audit
- Full creation flow (verified)
- Dropdown population mechanism (verified)
- Broken steps with file:line

---

## 4. Support Agent Organization Access

### What to find
- [x] `support_agent` role definition in RBAC (DB or enum)
- [x] Permissions assigned to this role on tenant detail pages
- [x] Middleware/guard that enforces support agent scope
- [x] Whether a support agent can view other tenants' data
- [x] Whether there is an "assign support agent" action on the detail page
- [x] How support agent access is scoped: per-tenant? per-organization? global?

### Verification checklist
- [x] Read the auth middleware for the tenant detail route
- [x] Confirm support agents cannot access tenants they are not assigned to
- [x] Confirm the RBAC check fires before data is returned (not after)
- [x] Check if support agent tokens embed tenant scope in JWT claims

### Expected output in audit
- Role definition location
- Enforcement mechanism (verified)
- Any cross-tenant access gaps with file:line

---

## 5. Invite Finance User

### What to find
- [x] The Invite Finance User UI component
- [x] The invite API endpoint and backend handler
- [x] Whether invite creates a user directly in Bigcapital's DB
- [x] Whether invite sends an email (Resend/Nodemailer — which one?)
- [x] Whether a pending invite record is stored in the control plane DB
- [x] What happens if the Finance container for this tenant is not running
- [x] Whether the invited user can log in to Finance after accepting

### Verification checklist
- [x] Trace: invite submit → backend → Bigcapital user creation (or pending record)
- [x] Confirm email is dispatched — check template and provider
- [x] Confirm error handling exists for unreachable Finance service
- [x] Test flow: does accept link resolve correctly?

### Expected output in audit
- Full invite flow (verified)
- Broken steps with file:line
- Whether invite is functional end-to-end or partially implemented

---

## 6. License

### What to find
- [x] The License section component
- [x] What fields are rendered (plan name, expiry, activation count, status, fingerprint)
- [x] The endpoint that fetches license data for this tenant
- [x] How a license is linked to a tenant (FK? JWT offline token? activation record?)
- [x] Whether a license can be reassigned
- [x] Whether license expiry enforces any tenant restriction
- [x] Whether this section is functional or a UI placeholder

### Verification checklist
- [x] Find license schema in DB (or licensing service)
- [x] Trace fetch: tenant detail load → license endpoint → response shape
- [x] Confirm expiry check exists in backend (not just cosmetic in UI)
- [x] Check if blacklisted fingerprints are checked here

### Expected output in audit
- License model and assignment mechanism (verified)
- Expiry enforcement (verified or confirmed missing)
- Functional vs placeholder verdict with file:line

---

## Deliverables

| File | Contents |
|------|----------|
| `TENANT_DETAIL_AUDIT.md` | Full findings for all 6 sections, priority fix table |
| `INVEST.md` | This investigation plan (source of truth for scope) |

---

## Priority Fix Table (filled in `TENANT_DETAIL_AUDIT.md`)

See `TENANT_DETAIL_AUDIT.md` for verified severity and file:line citations.

---

## Audit Rules
1. **Read before every claim** — no behavior is assumed
2. **File:line for every finding** — vague references are not accepted
3. **Rename is P0** — do not suggest enabling or fixing it until every downstream effect is mapped
4. **Support agent scope is P0** — cross-tenant data leak is a security issue
5. **No edits during investigation** — fixes come after the full audit report is written

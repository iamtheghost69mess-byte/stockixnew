## Phase 5 — Production Hardening Controls

This section extends architecture scope with explicit production-operability controls.

### Reliability and Compensation
- Provision/deprovision flows must include compensating actions for post-commit side effects.
- Compensation progress must be traceable and resumable from persisted state/events.
- Failure outcomes must be idempotent under retries and worker restarts.

### Container Least-Privilege Baseline
- Production compose services should enforce `no-new-privileges`.
- App-facing services should prefer `read_only` root filesystems with explicit writable paths.
- Exceptions (database/stateful or docker-builder paths) must be documented in compose comments.

### Dead-Letter and Replay Operations
- Dead-letter (`dead`) jobs must be queryable by operators.
- Replay/requeue workflow must be explicit and audited via internal job endpoints.
- Retry policy and terminal-state semantics must be deterministic.

### Observability Backend Requirements
- Structured logs are required but not sufficient.
- API and worker must emit metrics suitable for external aggregation:
  - API latency and status distribution
  - worker success/failure counts
  - retry/dead-letter counts
- Correlation/request IDs must propagate dashboard -> API -> worker -> callbacks.

### Env Template Security Policy
- Root and prod env templates must mark security-critical values as `__MUST_OVERRIDE__`.
- Local convenience defaults are allowed only for non-sensitive values.
- Startup validation must fail fast when required production secrets are missing.

PLAN.md — GOLD STANDARD SAAS ARCHITECTURE (PHASED SYSTEM)
🎯 Purpose

This document defines the canonical SaaS architecture model and the strict enforcement rules across 4 phases:

Phase 1 → UI isolation (Dashboard)
Phase 2 → API ownership (Auth + Session + Identity)
Phase 3 → Execution isolation (Worker + Infra + DB purity)
Phase 4 → Environment + Config governance

Each phase has:

Clear boundaries
Allowed / forbidden rules
Expected architecture behavior
Verification criteria (PASS/FAIL conditions)
🧱 GLOBAL ARCHITECTURE PRINCIPLES (APPLIES TO ALL PHASES)
✔️ Core System Roles
Layer	Responsibility
apps/dashboard	UI + HTTP client ONLY
apps/api	ALL business logic + DB ownership
infra/worker-service	Async execution engine ONLY
packages/db	Schema + raw query helpers ONLY
packages/config	SINGLE source of truth for environment
infra/*	Execution adapters ONLY (docker, traefik, etc.)
❌ Hard Forbidden Rules (Global)
No cross-layer imports between:
apps/* → infra/*
infra/* → apps/*
packages/* → infra/*
No auth/session logic outside apps/api
No DB orchestration logic outside apps/api and worker execution boundary
No process.env outside:
packages/config
scripts / build tooling ONLY
🧱 PHASE 1 — DASHBOARD ISOLATION (UI LAYER PURITY)
🎯 Goal

Ensure apps/dashboard is a pure UI client.

✔️ Allowed in Dashboard
React components
API calls via HTTP (fetch, apiFetch)
Cookie/session storage (client-side only)
Route handlers that ONLY proxy requests
❌ Forbidden in Dashboard
@repo/db
createDb()
drizzle-orm
direct SQL access
authentication business logic
session signing / verification logic
MFA logic
📌 Expected Behavior

Dashboard must:

Call API endpoints in apps/api
Never compute identity or authentication decisions
Never read/write DB directly
🧪 PASS CONDITION

✔ No DB imports in apps/dashboard/**
✔ All auth flows go through apps/api
✔ No session/token signing logic exists in dashboard

🧱 PHASE 2 — API OWNERSHIP (AUTH + IDENTITY + BUSINESS LOGIC)
🎯 Goal

Ensure apps/api is the ONLY authority for identity, auth, MFA, sessions, invites

✔️ API MUST OWN
login
session validation
MFA setup + verification
invite acceptance
token signing (session + MFA)
password verification
role validation
❌ Forbidden Outside API
session creation
JWT signing
MFA verification logic
password comparison logic
role-based access decisions
📌 Expected Architecture

All auth flows:

Dashboard → HTTP → API → DB

NOT:

Dashboard → auth logic → DB ❌
🧪 PASS CONDITION

✔ All auth logic exists ONLY in apps/api/src/**
✔ Dashboard only calls API endpoints
✔ No signSession, verifyMfa, signJwt outside API
✔ No auth decision branching in dashboard

🧱 PHASE 3 — EXECUTION ISOLATION (WORKER + INFRA PURITY)
🎯 Goal

Ensure worker & infra are dumb execution engines only

✔️ Allowed in Worker
Receive job
Dispatch handler
Execute external commands (docker, HTTP, scripts)
Write final result (success/failure)
❌ Forbidden in Worker / Infra
retry strategy decisions
job claiming logic with state mutation rules
lifecycle decision trees
domain/business logic
provisioning orchestration flows
multi-step workflows inside worker
📌 Expected Worker Model
Correct Flow:
Worker:
  - fetch job
  - execute handler
  - write result
Forbidden Flow:
Worker:
  - decide retry logic ❌
  - decide lifecycle transitions ❌
  - orchestrate provisioning ❌
✔️ DB Rules in Phase 3

packages/db must ONLY:

define schema
expose raw query helpers
NO workflow logic
NO state machines
NO job orchestration
🧪 PASS CONDITION

✔ Worker contains NO lifecycle decision logic
✔ DB layer contains NO orchestration functions
✔ Infra only executes commands
✔ No retry/claim/state machine logic outside API

🧱 PHASE 4 — ENVIRONMENT + CONFIG GOVERNANCE
🎯 Goal

Ensure single-source-of-truth environment system

✔️ Allowed Usage

Only:

packages/config

is allowed to access:

process.env
environment parsing
environment validation
❌ Forbidden Usage

No process.env in:

apps/*
infra/*
services/*
packages/* (except config)
runtime business logic
📌 Expected Flow
OS ENV
   ↓
packages/config
   ↓
Typed config object
   ↓
All systems consume config ONLY
✔️ Allowed Exceptions
scripts/
build tooling
test tooling
🧪 PASS CONDITION

✔ No runtime process.env outside config
✔ All apps use @repo/config
✔ No duplicate env parsing systems
✔ Config is leaf-node (imports nothing from app/infra/db)

🧪 FINAL SYSTEM VALIDATION (ALL PHASES)
🟢 SYSTEM IS VALID ONLY IF:
Phase 1

✔ Dashboard = pure UI

Phase 2

✔ API = only auth + business logic authority

Phase 3

✔ Worker = dumb executor ONLY
✔ DB = schema/query ONLY
✔ Infra = execution ONLY

Phase 4

✔ Config = single source of truth
✔ Zero runtime env leaks

🧠 FINAL ARCHITECTURE MODEL
           [Browser]
               ↓
        apps/dashboard
         (UI only)
               ↓ HTTP
           apps/api
   (auth + business + DB owner)
               ↓
        packages/db
      (schema + queries)
               ↓
   infra/worker-service
     (execution engine)
               ↓
     docker / external systems

        packages/config
     (single env authority)
🚨 FINAL RULE

If ANY phase fails:

❌ System is NOT production-ready
❌ Do not proceed to next phase
❌ Fix must be isolated to violating layer only


GOLD STANDARD SAAS ARCHITECTURE — PLAN.md (FINAL SPECIFICATION)
📌 Document Purpose

This document defines the strict, enforceable architecture contract for the SaaS system.
It ensures clear separation of concerns, zero cross-layer leakage, and deterministic ownership rules across all system components.

This model is enforced via:

Code structure rules
Import boundaries
Runtime behavior constraints
CI validation scripts
🧠 0. CORE ARCHITECTURE MODEL (NON-NEGOTIABLE)
🧩 System Layers
Layer	Responsibility	Strict Rule
apps/dashboard	UI layer (client + rendering)	API-only consumer
apps/api	Business logic + identity + DB ownership	SINGLE backend authority
packages/db	Schema + raw query utilities	NO orchestration logic
infra/worker-service	Async execution engine	NO business decision-making
infra/*	Execution adapters (docker, traefik, etc.)	NO domain logic
packages/config	Environment + configuration authority	ONLY env access layer
🚨 GLOBAL CONSTRAINTS (APPLIES TO ALL PHASES)
❌ Forbidden System Behaviors
No DB access outside apps/api and infra/worker-service
No authentication logic outside apps/api
No session/token/MFA logic outside apps/api
No lifecycle decision-making inside worker or DB layer
No process.env outside:
packages/config
build/test/scripts (explicitly allowed tooling only)
No cross-layer imports:
apps → infra ❌
infra → apps ❌
packages → infra ❌
🧱 PHASE 1 — DASHBOARD ISOLATION (UI PURITY LAYER)
🎯 Objective

Ensure apps/dashboard is a pure presentation layer with zero backend authority.

✔ Allowed Behavior
UI rendering (React / Next.js)
HTTP calls to API (fetch, apiFetch)
Client-side state management
Cookie/session storage (non-authoritative)
❌ Forbidden Behavior
Direct DB access (@repo/db, createDb, drizzle)
Authentication logic (signing, verification, MFA logic)
Business rules (role validation, session validation decisions)
Any persistence logic
📌 Required Architecture Behavior

Dashboard must behave as:

UI → API → Backend

NOT:

UI → DB ❌
UI → Auth logic ❌
UI → Session validation ❌
🧪 PHASE 1 PASS CRITERIA

✔ No DB imports in apps/dashboard/**
✔ No auth/session logic inside dashboard
✔ All sensitive operations delegated to API
✔ Dashboard acts as dumb client only

🧱 PHASE 2 — API OWNERSHIP (AUTHORITY & BUSINESS LOGIC LAYER)
🎯 Objective

Ensure apps/api is the sole authority for all business logic and identity systems.

✔ API IS RESPONSIBLE FOR
Identity & Authentication
login
password validation
session creation & verification
JWT/session signing
MFA setup + verification
invite validation
Business Logic
role validation
permission decisions
user state transitions
tenant/account logic
Data Ownership
ALL DB reads/writes via API services
❌ FORBIDDEN OUTSIDE API
session signing (signSession)
MFA verification logic
password comparison
role evaluation logic
invite token validation logic
📌 Required Architecture Behavior
Dashboard → API → DB

API is the ONLY authority layer.

🧪 PHASE 2 PASS CRITERIA

✔ All auth logic exists ONLY in apps/api/src/**
✔ No session/MFA/password logic in dashboard
✔ Dashboard only proxies requests
✔ API fully owns identity lifecycle
✔ No business logic leaks into UI layer

🧱 PHASE 3 — EXECUTION & INFRASTRUCTURE PURITY LAYER
🎯 Objective

Ensure infra and worker are execution engines only, with zero decision-making authority.

✔ ALLOWED IN WORKER
Fetch job
Dispatch handler
Execute external systems (docker, HTTP, scripts)
Persist final job result (success/failure)
❌ FORBIDDEN IN WORKER / INFRA
No Decision Logic
retry policies
conditional branching based on business rules
lifecycle decisions (suspend/reactivate logic)
No Orchestration
multi-step provisioning pipelines
workflow chaining
dependency coordination between steps
No State Machine Behavior
no claim/attempt orchestration logic
no job lifecycle control logic
📌 REQUIRED WORKER MODEL
Correct Pattern
Worker:
  - receive job
  - execute handler
  - store result
Incorrect Pattern
Worker:
  - decides retry logic ❌
  - decides job state transitions ❌
  - orchestrates provisioning ❌
✔ DB LAYER RULE (STRICT)

packages/db must ONLY:

define schema
expose query helpers
perform raw data reads/writes

❌ It must NOT:

manage queues
handle retries
implement job lifecycle logic
encode state machines
🧪 PHASE 3 PASS CRITERIA

✔ Worker is stateless execution engine
✔ No retry / lifecycle logic in worker
✔ DB contains NO orchestration behavior
✔ Infra contains NO business rules
✔ Provisioning logic is purely external execution

🧱 PHASE 4 — CONFIG & ENVIRONMENT GOVERNANCE LAYER
🎯 Objective

Establish a single source of truth for all environment configuration

✔ SINGLE AUTHORITY

ONLY:

packages/config

is allowed to:

read process.env
validate environment variables
expose typed config objects
❌ FORBIDDEN USAGE

No process.env usage in:

apps/*
infra/*
packages/*
services/*
runtime business logic
📌 REQUIRED ENV FLOW
OS ENV
   ↓
packages/config (validation + typing)
   ↓
Typed config object
   ↓
Consumed by all layers
✔ EXCEPTIONS

Allowed ONLY in:

scripts/
CI/CD tooling
build systems
test environments
🧪 PHASE 4 PASS CRITERIA

✔ No runtime process.env outside config
✔ All apps consume config only
✔ No duplicate env parsing systems
✔ Config is dependency leaf node

🧪 FINAL SYSTEM VALIDATION RULE (ALL PHASES)

System is ONLY valid if ALL conditions are met:

Phase 1 (UI)

✔ Dashboard = pure API consumer

Phase 2 (API)

✔ API = only source of truth for auth + business logic

Phase 3 (Execution)

✔ Worker = dumb executor only
✔ DB = schema/query only
✔ Infra = execution only

Phase 4 (Config)

✔ Config = single env authority
✔ No runtime env leaks

🧠 FINAL ARCHITECTURE MODEL (TARGET STATE)
        [Browser]
            ↓
   apps/dashboard (UI ONLY)
            ↓ HTTP
       apps/api (AUTH + BUSINESS + DB OWNER)
            ↓
     packages/db (RAW DATA LAYER)
            ↓
 infra/worker-service (EXECUTION ENGINE)
            ↓
     docker / external systems

     packages/config (ENV AUTHORITY)
🚨 FINAL RULE OF THE SYSTEM

If ANY phase fails → system is NOT production-ready
If ANY boundary leaks exist → architecture is INVALID
If ANY cross-layer logic exists → must refactor immediately
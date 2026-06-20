# Stockix — Remediation Plan

**Document type:** Engineering Remediation Plan  
**Scope:** Architecture audit findings  
**Last updated:** 2026-06-20  

## Summary Dashboard

| Status | Count | Issues |
|---|---|---|
| **✅ DONE** | 14 | 002, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 017 |
| **🟡 ACTIVE** | 0 | None |
| **🔴 DEFERRED / OUT OF SCOPE** | 4 | 001, 003, 016, 018 |

---

## 🟢 COMPLETED INITIATIVES

1. **Architecture & Databases**
   - **ISSUE-002 & 015:** Fully isolated PMS Guest Data into `@repo/pms-db`. Configured `PMS_DATABASE_URL` and decoupled PMS service imports safely. Added `/scripts/migrate-pms-to-isolated-db.sh`.
   - **ISSUE-009:** Dismantled the 752-line God Config file into scalable, domain-specific modules.
2. **Monorepo & Build System**
   - **ISSUE-004:** Resolved `@repo/shared` naming collision to `@stockix/finance-shared`.
   - **ISSUE-008:** Migrated the legacy Lerna build system for Finance into Turborepo for a unified build pipeline.
   - **ISSUE-010:** Migrated POS Backend to TypeScript and added a strict `tsconfig.json`.
3. **UI & Routing**
   - **ISSUE-006 & 013:** Promoted `@repo/ui` as the single source of truth for all Shadcn components. Enforced strict consumption across POS and Dashboard.
   - **ISSUE-014:** Stripped 80+ redundant route handlers containing business logic from the Dashboard; replaced with secure Next.js `rewrites` to protect `PLATFORM_API_SECRET`.
4. **Operations & Observability**
   - **ISSUE-007:** Rolled out API versioning (`/v1`) without downtime.
   - **ISSUE-011 & 012:** Eliminated raw `console.error` logs. Instituted structured JSON logging and OpenTelemetry/Grafana Tempo distributed tracing.
   - **ISSUE-017:** Refactored `docker-compose.yml` for Swarm to enable High Availability (HA) multi-replica deployments.
   - **ISSUE-005:** Cleared out scratch files and root repository bloat.

---

## 🔴 DEFERRED & OUT OF SCOPE

- **ISSUE-001 · `C:\` Windows Path Artifacts**
  *Status:* DEFERRED — Pending team coordination for git history rewrite via BFG Repo Cleaner.
- **ISSUE-003 · Secrets in Environment Variables**
  *Status:* DEFERRED — Will revisit when moving to ECS (ISSUE-017). Current `.env` strategy is adequate.
- **ISSUE-016 · Finance Frontend Migration (Blueprint.js to Shadcn)**
  *Status:* OUT OF SCOPE — Not prioritized for this cycle.
- **ISSUE-018 · Metadata-Driven UI**
  *Status:* OUT OF SCOPE — Long-term product capability.

---

## Execution Sequencing

1. **DONE:** ISSUE-005, 004, 011, 009, 008, 006, 007, 010, 012, 013
2. **DONE:** ISSUE-002, 014, 015, 017
3. **NEXT:** All active architecture remediation items are complete. Proceed to product feature development.

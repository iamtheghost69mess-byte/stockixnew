# SaaS Owner Dashboard Audit Report

## Summary
The `apps/saas-dash` module is broadly implemented and has real backend integrations (`apps/pos-backend/routes/platformV1Route.js` + platform controllers), but quality is uneven: several screens are fully wired, while multiple critical UX actions are disconnected or partially wired.  
Main risks are frontend/backend mismatches (notifications read endpoint, jobs list/detail UX wiring, missing revoke actions in API keys/webhooks), permissive/weak response contracts (`z.any`/`passthrough`), and inconsistent filtering/pagination behavior.

---

## Module Audit Table

| Module | Frontend | Backend | Connected | Data Source | Status | Notes |
|--------|----------|---------|-----------|------------|--------|------|
| Platform Overview | Complete | Complete | Yes | Real API | Complete | Uses `/metrics/summary`, `/metrics/kpis`, `/metrics/analytics`; charts and KPIs render real data. |
| Organizations | Complete | Partial | Yes | Real API + sensitive raw fields | Partial | CRUD and provisioning wired; detail exposes internal IDs and can expose plaintext `defaultCredentials` when returned by backend. |
| Subscriptions | Partial | Partial | Partial | Real API | Partial | List/update works; no pagination UI, no status filters, no optimistic safeguards; update returns raw model on backend. |
| Revenue | Partial | Partial | Partial | Derived from reports/KPIs | Partial | No dedicated revenue module; revenue only inferred via KPIs/reports. |
| Global Users | Complete | Partial | Yes | Real API | Partial | Listing/detail/actions wired; backend search regex is unsanitized, and responses return mostly raw user objects. |
| Inventory Master | Complete | Partial | Yes | Real API | Partial | Real low-stock/slow-moving/movements; no org scoping UI, and backend returns mostly raw documents. |
| Reports | Complete | Complete | Yes | Real API | Complete | Multi-report tabs and charts wired to backend report endpoints with date/org filters. |
| Notifications | Partial | Partial | Broken | Real API | Broken | Feed loads, but “Mark all read” calls `/notifications/all/read` (missing); backend expects `POST /notifications/:id/read` with `id=all`. |
| API Keys | Partial | Complete | Partial | Real API | Partial | Create/list works; revoke endpoint exists but frontend has no actionable revoke control in table. |
| Compliance | Complete | Complete | Yes | Real API + queue jobs | Complete | Export/deletion requests and job links wired; lifecycle/job flow works. |
| Jobs | Partial | Complete | Broken | Real API | Broken | List endpoint exists, but UI filters are URL-only and not sent to API; row->detail navigation hook never fires from table cells. |
| Webhooks | Partial | Complete | Partial | Real API | Partial | Register/list/outbox wired; revoke mutation exists but no rendered action trigger in table. |
| Audits | Partial | Complete | Partial | Real API | Partial | Log listing works; org pin preference is stored but not applied to request filtering. |
| Feature Flags | Complete | Complete | Yes | Real API | Complete | List/update with confirmation and cache invalidation works. |
| Team | Complete | Complete | Yes | Real API | Complete | Invitation creation/list wired with org lookup and validation. |
| Settings | Partial | Complete | Partial | Real API | Partial | Split across `System`, `Flags`, `Team`; no unified settings orchestration layer. |
| Developers | Partial | Complete | Partial | Real API + static swagger viewer | Partial | OpenAPI/webhook/billing tools exist; access gate is too broad (`org:read`) for write-heavy actions causing frequent 403 for non-billing roles. |
| System Monitoring | Partial | Partial | Partial | Real API + SSE | Partial | Monitoring signals exist (SSE, notifications, SLO snippet), but no dedicated monitoring module/dashboard. |

Legend:
- Complete
- Partial
- Missing
- Broken

---

## Frontend Problems
- `Notifications` mark-all action is broken: frontend posts to `/notifications/all/read`, but backend route is `POST /notifications/:id/read` with `all` as path id.
- `Jobs` filters (`queue`, `status`) only update URL in `jobs/page.tsx`; API query in `ResourcePage` never forwards these filters.
- `Jobs` row navigation is broken: `onAction` in `jobs/page.tsx` is never triggered because `ResourceTable` only triggers actions for `switch`/`custom` cells.
- `API Keys` revoke flow is dead UI: mutation exists in `api-keys/page.tsx`, but resource columns have no action cell/button to invoke it.
- `Webhooks` revoke flow is dead UI: mutation exists in `webhooks/page.tsx`, but resource columns do not expose a revoke action.
- Permission mismatch in `ResourceRegistry.jobs`: uses `jobs:admin` while backend RBAC and nav use `queue:admin`; this can block page access despite visible nav.
- `Developers` page uses permissive `org:read` gate but executes `billing:write`/`webhook:admin` mutations; UX degrades into runtime 403 errors.
- Multiple components rely on `confirm()` dialogs for destructive actions, creating inconsistent UX and weak action affordance compared to the rest of shadcn dialogs.
- Widespread `any` usage in resource plumbing (`ResourceField`, page action handlers, mutation payloads) reduces type safety and maintainability.
- Search behavior is inconsistent: generic `search` param is used for most resources even when backend supports different/no search parameters.

---

## Backend Problems
- Global users search uses unsanitized regex (`new RegExp(search, "i")`) in `platformGlobalUserController.js`, which can allow regex abuse.
- Several list endpoints return raw Mongoose objects (orgs, audits, jobs, inventory, notifications), with inconsistent transformation and shape stability.
- Org deletion uses direct `findByIdAndDelete` with no soft-delete workflow/cascade safety checks in `platformOrgController.js`.
- Platform inventory endpoints aggregate across tenants without strict isolation guardrails; optional org filtering is not strongly validated.
- Financial report aggregation loops organizations sequentially (`for ... await`) in `platformMetricsController.js`, likely slow with larger org counts.
- Jobs list (`listAllJobs`) scans multiple queues and resolves each job state individually; cost scales poorly and metadata is approximate.
- Invitation creation returns plaintext invite token in API response (useful for testing, risky for production if not gated).
- Validation depth is uneven: some endpoints strongly validate (`system-settings`), others accept broad payloads (`flags`, webhook enqueue payload).
- Error response structures are mixed (`application/problem+json` vs `{ success:false, message }`), increasing client-side handling complexity.

---

## Connection Problems
- Frontend route `/notifications/all/read` has no matching backend route; backend expects `/notifications/:id/read`.
- Jobs list UI appears filterable, but backend never receives `queue`/`status` filters from that screen.
- Jobs detail navigation is intended from list actions, but no actionable table cell triggers navigation.
- API key revoke endpoint exists (`POST /auth/api-keys/:id/revoke`) but has no working invocation path in table UI.
- Webhook revoke endpoint exists (`DELETE /webhooks/endpoints/:id`) but has no working invocation path in table UI.
- Sidebar uses `queue:admin`, but jobs page resource gate uses `jobs:admin`, producing access inconsistency.
- Some query invalidation paths are inconsistent with actual query keys; stale views are possible after mutations in specific screens.

---

## Raw Data Problems
- Organization detail explicitly shows internal `_id` and raw fields in UI.
- Global user detail exposes internal user `_id` and direct role/status internals.
- Audit table displays actor/org IDs as raw identifiers without human mapping.
- Several schemas are permissive (`z.any`, `.passthrough()`), allowing raw backend shape drift to leak to UI.
- Reports/KPI blocks display cents as raw numeric units in places (labeled as cents but still not formatted for readability).
- Date handling is inconsistent (table `PPP` dates, `toLocaleDateString`, full `toLocaleString`, raw timestamps in jobs).

---

## Security Problems
- Plaintext bootstrap staff PINs are stored in `Organization.defaultCredentials` and surfaced in owner UI; this is highly sensitive.
- Invitation token is returned from API response on create; if exposed in logs/client telemetry, token compromise is possible.
- Developers module grants page visibility at `org:read` despite containing privileged mutation controls (billing/webhook writes).
- Unsanitized regex in global user search can be abused for expensive regex patterns.
- Public `/api/platform/v1/openapi.json` is intentionally unauthenticated; acceptable for docs, but should be an explicit product decision.

---

## Performance Problems
- Metrics/report aggregation across many orgs is mostly serial in controller loops, increasing latency as org count grows.
- Jobs list gathers and sorts cross-queue jobs in memory with per-job async state resolution.
- Notifications feed polls every 5s and also uses SSE invalidations; potential redundant refresh churn.
- Resource pages fetch without server-side pagination controls in most modules, which will degrade with large datasets.

---

## Missing Features
- Dedicated Revenue module (separate from generic KPIs/reports) is missing.
- Dedicated System Monitoring module/page is missing (only partial monitoring via overview/SSE/toasts).
- Unified Settings hub is missing; settings are fragmented across multiple pages.
- Working revoke actions for API keys and webhook endpoints are missing in rendered tables.
- Fully functional jobs filtering UX (queue/status/pagination connected to backend query) is missing.
- Robust per-module empty/error/loading standards are not consistently implemented across all custom pages.
- Strong typed response contracts for all endpoints are missing (too many permissive schemas/`any`).

---

## Priority Fix Plan

### Critical
- Fix notifications mark-all endpoint mismatch (frontend should call `POST /notifications/all/read` alias support or switch to `POST /notifications/:id/read` with `id=all`).
- Fix jobs module wiring: pass queue/status params to API and implement clickable row/action column for detail navigation.
- Implement real action columns/buttons for API key revoke and webhook revoke flows.
- Resolve permission mismatch (`jobs:admin` vs `queue:admin`) in frontend permission model/resource config.
- Remove or tightly control plaintext credential exposure (`defaultCredentials`) in org responses/UI.

### Important
- Standardize backend response DTOs (avoid raw model leakage) and tighten zod schemas (remove `z.any` where practical).
- Sanitize regex-based search in global users endpoint.
- Add pagination/filter controls consistently across high-volume resources (users, audits, notifications, jobs, webhooks).
- Improve developers module authorization UX (hide/disable controls by precise permission checks).
- Normalize date/currency formatting across all tables/cards.

### Nice to Have
- Add dedicated Revenue dashboard module (MRR/ARR/LTV/churn-focused).
- Add dedicated System Monitoring module (queue health, error rates, audit anomalies, webhook delivery SLOs).
- Add richer cache invalidation strategy with shared query key helpers per feature.
- Add integration tests specifically for frontend↔backend contract paths for owner dashboard actions.

---

## Final Architecture Health Score
Give a score out of 10 for:
- Frontend: **6.5/10**
- Backend: **7.0/10**
- Integration: **5.5/10**
- Maintainability: **6.0/10**

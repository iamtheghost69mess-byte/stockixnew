# UI/UX Component and Lib Audit

This document maps what exists in `shared` and `lib`, what is duplicated, where it is used, and how pieces connect.

## 1) Shared Components (current state)

Only one shared component exists:

- `apps/pos-frontend2/src/components/shared/data-table.tsx`

Used by:

- `apps/pos-frontend2/src/app/(main)/dashboard/purchase-orders/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/suppliers/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/recipes/_components/recipes-editor.tsx`

Connection:

- Page-level dashboard modules -> import `DataTable` from `components/shared/data-table` -> pass TanStack columns/data/paging/sorting state.
- This shared table is only shared inside `pos-frontend2`, not across apps.

## 2) Components Outside `shared`

`apps/pos-frontend2/src/components` has many non-shared components (domain + local UI wrappers), including:

- `resource-page.tsx`
- `resource-table.tsx`
- `access-gate.tsx`
- `date-range-picker.tsx`
- `pos/*` components
- `ui/*` local primitives (example: `button.tsx`, `input.tsx`, `card.tsx`, `textarea.tsx`)

`apps/saas-dash/src/components` also has parallel app-level components, including:

- `resource-page.tsx`
- `resource-table.tsx`
- `access-gate.tsx`
- `date-range-picker.tsx`
- platform-specific components (`platform-*`, `owner/*`, `webhooks/*`, etc.)

`packages/ui/src/components` is the cross-app base UI kit and contains generic primitives (`button`, `input`, `table`, `select`, `card`, `alert`, etc.).

## 3) Component Duplicates (outside shared)

Duplicate component names across `pos-frontend2` and `saas-dash`:

- `access-gate.tsx`
- `date-range-picker.tsx`
- `resource-page.tsx`
- `resource-table.tsx`

Status:

- These are not identical files (implementations diverged).

### 3.1 `resource-page.tsx` connection map

POS app file:

- `apps/pos-frontend2/src/components/resource-page.tsx`

Connected imports:

- `@/components/access-gate`
- `@/components/resource-table`
- `@/lib/mdd/parse-api-response`
- `@/lib/mdd/resource-config`
- `@/lib/pos-api-fetch`

Used by:

- `apps/pos-frontend2/src/app/(main)/dashboard/categories/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/ingredients/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/ingredient-categories/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/menu-items/page.tsx`
- `apps/pos-frontend2/src/app/(main)/dashboard/locations/page.tsx`

SaaS app file:

- `apps/saas-dash/src/components/resource-page.tsx`

Connected imports:

- `@/components/access-gate`
- `@/components/resource-table`
- `@/lib/parse-api-response`
- `@/lib/resource-config`
- `@/lib/platform-http`
- `@/lib/resource-query-key`

Used by:

- `apps/saas-dash/src/app/(platform)/api-keys/page.tsx`
- `apps/saas-dash/src/app/(platform)/audits/page.tsx`
- `apps/saas-dash/src/app/(platform)/flags/page.tsx`
- `apps/saas-dash/src/app/(platform)/jobs/page.tsx`
- `apps/saas-dash/src/app/(platform)/organizations/page.tsx`
- `apps/saas-dash/src/app/(platform)/team/page.tsx`
- `apps/saas-dash/src/app/(platform)/users/page.tsx`
- `apps/saas-dash/src/app/(platform)/webhooks/page.tsx`
- `apps/saas-dash/src/components/webhooks/webhook-outbox-log.tsx`

### 3.2 `resource-table.tsx` connection map

POS app file:

- `apps/pos-frontend2/src/components/resource-table.tsx`

Used by:

- `apps/pos-frontend2/src/components/resource-page.tsx`

SaaS app file:

- `apps/saas-dash/src/components/resource-table.tsx`

Used by:

- `apps/saas-dash/src/components/resource-page.tsx`
- `apps/saas-dash/src/app/(platform)/devices/page.tsx`

### 3.3 Other duplicated component names

`access-gate.tsx`:

- POS usage example: `apps/pos-frontend2/src/components/resource-page.tsx`, vendor returns pages
- SaaS usage example: `apps/saas-dash/src/components/resource-page.tsx`, system/developers/compliance/devices pages

`date-range-picker.tsx`:

- POS usage: `apps/pos-frontend2/src/app/(main)/dashboard/analytics/_components/analytics-overview.tsx`
- SaaS usage: no direct imports detected from `components/date-range-picker` in current scan

## 4) `lib` Inventory and Duplicates

Primary app lib roots:

- `apps/pos-frontend2/src/lib`
- `apps/saas-dash/src/lib`
- `packages/ui/src/lib`

Duplicate lib filenames across these roots:

- `apps/pos-frontend2/src/lib/mdd/parse-api-response.ts`
- `apps/saas-dash/src/lib/parse-api-response.ts`

- `apps/pos-frontend2/src/lib/mdd/resource-config.tsx`
- `apps/saas-dash/src/lib/resource-config.tsx`

- `apps/pos-frontend2/src/lib/utils.ts`
- `apps/saas-dash/src/lib/utils.ts`
- `packages/ui/src/lib/utils.ts`

### 4.1 `parse-api-response` connection

- POS: imported by `apps/pos-frontend2/src/components/resource-page.tsx`
- SaaS: imported by `apps/saas-dash/src/components/resource-page.tsx` and multiple platform pages/lib modules (reports, organizations, devices, selector/search components)

### 4.2 `resource-config` connection

- POS: imported by resource pages and dashboard page modules that declare resource metadata
- SaaS: imported by resource pages, platform pages, webhook log, and query key helpers

### 4.3 `utils` split

- Multiple `utils.ts` files exist in app libs and package lib; this indicates helper logic is split by app/package boundary.

## 5) Practical architecture read

- `shared` is currently very small (only one table component) and scoped to one app.
- Cross-app reuse mostly happens through `packages/ui`, but both apps still keep duplicated app-level wrappers (`resource-page`, `resource-table`, `access-gate`, `date-range-picker`).
- Core data-grid flow is duplicated in parallel stacks:
  - POS stack: `resource-page` -> `resource-table` -> `mdd/resource-config` + `mdd/parse-api-response` + `pos-api-fetch`
  - SaaS stack: `resource-page` -> `resource-table` -> `resource-config` + `parse-api-response` + `platform-http`

## 6) Consolidation candidates

Highest-value consolidation targets:

1. `resource-page.tsx` (shared abstract base + app adapters for transport/pagination differences)
2. `resource-table.tsx` (single generic table renderer with app-specific props)
3. `parse-api-response` and `resource-config` contracts (shared schema/selector interfaces)
4. selected duplicated wrappers (`access-gate`, `date-range-picker`) if behavior requirements are aligned


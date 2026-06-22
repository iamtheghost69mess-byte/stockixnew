# Stockix UI Architecture & Design System (Implementation Record)

## Executive Summary

This document serves as the master architectural blueprint and implementation record for the UI ecosystem across the Stockix monorepo (Control Plane, POS System, and PMS System). 

Previously, the platform suffered from severe UI fragmentation, duplicating components across multiple packages and utilizing conflicting systems. After a successful architecture migration, the UI is now fully unified, strictly typed, and driven by a scalable Meta-Driven UI layer.

**Key Achievements of the Migration:**
1. **True Shared UI**: The entire monorepo now consumes a single Source of Truth located in `packages/ui-core`.
2. **Backward Compatible Aliasing**: Application logic (e.g., in `apps/pos-frontend2`) was left 100% untouched. Legacy imports mapping to `@/components/ui/*` and `@restaurant-pos/ui` were safely aliased in `tsconfig.json` to resolve directly to `ui-core`.
3. **Legacy Fork Eradicated**: The duplicated, disconnected `services/posnew/packages/ui` workspace and `services/posnew/apps/pos-frontend2/src/components/ui` overrides were completely deleted.
4. **Base UI Integration**: Complex accessibility and generic typing problems were resolved using `@base-ui/react` primitives. Legacy `asChild` paradigms were seamlessly polyfilled back onto the Base UI triggers (e.g., `SidebarMenuButton`, `PopoverTrigger`) to maintain backward compatibility.
5. **Meta-Driven UI**: Forms and Tables in the Dashboard are actively driven by the `ui-shared` Meta-Engine, with robust escape hatches (`renderCell`, `CustomComponent`) implemented.

---

## 1. Unified UI Architecture

The repository employs a **Layered Architecture** orchestrated by Turborepo to enforce clean dependency graphs:

```text
packages/
├── theme/          # Pure CSS variables and Tailwind config presets. 
│                   # -> Ensures visual consistency and enables multi-tenant branding.
├── ui-core/        # Pure, stateless Shadcn/Base-UI primitives (Button, Input, Dialog).
│                   # -> Safe to import anywhere. Zero business logic.
└── ui-shared/      # Complex, composite components (AppShell, MetaTable, MetaForm).
                    # -> Built on top of ui-core.
```

### Build & Compilation Topology
The packages (`ui-core`, `ui-shared`, `theme`) are configured as **TypeScript Source Packages**. 
- They are natively transpiled by the Next.js/Vite consuming applications (via `transpilePackages`).
- The `turbo.json` build graph mandates that the application build tasks properly resolve these dependencies, but no intermediate `dist` bundles are built for the UI components. This ensures maximum dead-code elimination and React Server Component compatibility.

---

## 2. Component De-Duplication & Source of Truth

During the migration, 56+ duplicated primitive components were mapped, audited, and safely resolved to the singular `packages/ui-core`.

| Component Category | Unified Source of Truth | Migration Result |
| :--- | :--- | :--- |
| **Core Primitives** (Button, Input, Cards) | `packages/ui-core/src/` | Legacy POS overrides deleted. App-level `tsconfig` aliases redirect to this package. |
| **Complex Inputs** (Combobox, Date) | `packages/ui-core/src/` | POS-specific highly optimized variants (`native-select`, `combobox`) merged back into the global core. |
| **Tables & Data Grids** | `packages/ui-shared/src/` | Standardized using `@tanstack/react-table` powering the Meta-UI layer. |
| **Layouts (Sidebar)** | `packages/ui-core/src/` | The POS `Sidebar` was merged and heavily optimized to support recursive `asChild` composition via Base UI `useRender`. |

---

## 3. Meta-Driven UI Engine

The Meta-Driven UI approach allows 70%+ of administrative interfaces (Dashboard config panels, POS tables, PMS data grids) to be dynamically generated from strict JSON/Zod schemas, drastically reducing React boilerplate.

### Implementation Status
* **`MetaTable`**: Fully operational. Currently deployed in `apps/dashboard/app/(dashboard)/api-keys/page.tsx`.
* **`MetaForm`**: Fully operational. Powered by `react-hook-form` and `zod` via `ui-shared/src/schema.ts`.

### Escape Hatches
Meta-components inherently support raw React overrides for complex requirements:
* `MetaTable` supports a `renderCell?: (value, row) => ReactNode` override per-column.
* `MetaForm` supports a `CustomComponent?: React.ComponentType` override per-field.

### Hardcoded Exclusions
The following high-interaction routes are intentionally excluded from the Meta-Engine to preserve zero-latency performance and custom event handling:
* **POS**: The main checkout terminal and cart interface.
* **PMS**: The interactive calendar/scheduling timeline for booking management.
* **Dashboard**: Complex visual wizards (e.g., the multi-step Tenant Provisioning Wizard).

---

## 4. Development & Tooling

### TypeScript Mappings (Example from `pos-frontend2`)
Application boundaries remain strictly preserved without codemod rewrites. Components are injected via TS `paths`:
```json
"paths": {
  "@/*": ["./src/*"],
  "@/components/ui/*": ["../../packages/ui-core/src/*"],
  "@restaurant-pos/ui": ["../../packages/ui-core/src/index.ts"],
  "@repo/ui-core": ["../../packages/ui-core/src/index.ts"]
}
```

### Changesets
Versioning and package publishing are handled natively via `@changesets/cli`. 
* `.changeset/` contains the migration logs and semantic version bumps.
* `.github/workflows/publish.yml` orchestrates automated tagging and releasing on merge.

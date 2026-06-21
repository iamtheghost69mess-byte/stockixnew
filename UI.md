# Stockix Platform: Global UI/Frontend Architecture Audit

This document serves as the master audit and architectural blueprint for the Frontend and UI ecosystem across the Stockix monorepo. It outlines existing UI systems, duplicates, inconsistencies, and a concrete roadmap to achieve a fully unified, scalable Design System.

---

## 1. Shared UI System (Current State)

The repository currently attempts to share UI components but fails to enforce a single source of truth. 

**Existing Shared Systems:**
- **Dashboard UI Package**: `packages/ui/` (Shadcn + TailwindCSS base, used primarily by `apps/dashboard`).
- **POS UI Package**: `services/posnew/packages/ui/` (A completely duplicated Shadcn + TailwindCSS package used by `posnew` apps).
- **Finance Shared**: Finance (`services/stockix-finance`) has its own internal shared structure (`shared/email-components`, etc.) but lacks a central React component system, relying heavily on standard vendor libraries.

**Conclusion**: We have *two* competing shared design systems (`packages/ui` vs `services/posnew/packages/ui`), neither of which are used by the Finance or Chatlive systems.

---

## 2. Duplicated UI Components

There is massive fragmentation and component duplication across the platform.

### Core Primitives (Buttons, Inputs, Cards, Dialogs)
- **Where it exists**:
  1. `packages/ui/src/` (Dashboard's Shadcn instance)
  2. `services/posnew/packages/ui/src/components/` (POS's Shadcn instance)
  3. `services/posnew/apps/pos-frontend2/src/components/ui/` (Local overrides in POS)
  4. `services/stockix-finance/packages/webapp/src/components/` (Custom wrappers around BlueprintJS)
- **Versions**: 4 different versions.
- **Recommendation**: **MERGE & KEEP** `packages/ui/src/`. **DELETE** all local `ui/` folders in POS and migrate Finance.

### Tables & Data Grids
- **Where it exists**:
  1. `packages/ui/src/table.tsx`
  2. `services/posnew/apps/pos-frontend2/src/components/resource-table.tsx`
  3. `services/stockix-finance/packages/webapp/src/components/Table/` (Uses `@blueprintjs/table`)
- **Versions**: 3 different table philosophies.
- **Recommendation**: **KEEP** `@tanstack/react-table` combined with `packages/ui/src/table.tsx`. **DELETE** BlueprintJS tables.

### Layouts & App Shells
- **Where it exists**:
  1. `apps/dashboard/components/dashboard-app-shell.tsx` (and `pms-page-shell.tsx`, `pos-page-shell.tsx`)
  2. `services/stockix-finance/packages/webapp/src/components/AppShell/`
- **Versions**: 2 major layout architectures.
- **Recommendation**: **MOVE** to a generic layout system in `packages/layouts/` or `packages/ui/layouts/`.

### Charts
- **Where it exists**:
  1. `packages/ui/src/chart.tsx` (Recharts wrapper)
  2. `services/posnew/packages/ui/src/components/chart.tsx`
- **Versions**: 2 exact duplicates.
- **Recommendation**: **DELETE** POS charts package and use the central `packages/ui/src/chart.tsx`.

---

## 3. UI Inconsistencies

The platform suffers from severe stylistic and architectural inconsistencies across different products:

| Area | Dashboard (Control Plane) | POS System (`posnew`) | Finance (`BigCapital`) | Chatlive (`Rails`) |
| :--- | :--- | :--- | :--- | :--- |
| **Framework** | Next.js 16 (React) | Next.js 16 (React) | Vite (React) | Rails + Vite |
| **Component Lib** | Shadcn UI | Shadcn UI (Forked) | Blueprint JS | Tailwind Native |
| **Styling** | Tailwind CSS | Tailwind CSS | Styled Components + CSS | Tailwind CSS |
| **State Mgt** | React Context/Hooks | Zustand + React Query | Redux + Thunk | Rails State / JS |
| **Theming** | `next-themes` (Light/Dark) | `next-themes` | Blueprint Dark (`.bp4-dark`) | Standard CSS |

**Key Offenses**:
- **Finance App**: Completely siloed. Uses `@blueprintjs/core` and `styled-components` which fundamentally clash with the rest of the ecosystem (Tailwind + Radix).
- **POS App**: Reinvented the wheel by copying `packages/ui` into its own monorepo boundaries (`services/posnew/packages/ui`).

---

## 4. Missing Shared UI System & Proposed Structure

While `packages/ui/` exists, the repository lacks the necessary scaffolding to scale a unified design system. We are missing generic hooks, global theming tokens, and meta-driven utilities.

**Proposed Unified Architecture:**

```text
packages/
  ├── ui/               # Source of Truth: All primitive React components (Radix + Tailwind via Shadcn)
  ├── hooks/            # Source of Truth: Shared React hooks (useMediaQuery, useDebounce, etc.)
  ├── theme/            # Source of Truth: Tailwind configs, CSS variables, typography, colors
  ├── utils/            # Source of Truth: Date, currency formatting, validation schemas (Zod)
  ├── layouts/          # Optional: Shared AppShells, Navigation components
```

---

## 5. Component Ownership Mapping

| Component | Consumers | Source of Truth (Proposed) | Action Required |
| :--- | :--- | :--- | :--- |
| **Button / Primitives** | Dashboard, POS, Finance | `packages/ui/src/button.tsx` | MOVE POS + Finance to root `ui` package. |
| **Forms / Inputs** | Dashboard, POS, Finance | `packages/ui/src/form.tsx` (RHF + Zod) | STRIP out BlueprintJS forms in Finance. |
| **Data Table** | Dashboard, POS, Finance | `packages/ui/src/table.tsx` (Tanstack) | CONVERT Finance `@blueprintjs/table` to Tanstack. |
| **Date Picker** | Dashboard, POS, Finance | `packages/ui/src/calendar.tsx` | REPLACE BlueprintJS datetime pickers. |
| **Auth UI** | Dashboard | `apps/dashboard/components/` | MOVE to `packages/ui/auth` or `packages/auth`. |
| **Sidebar / Nav** | Dashboard, Finance | `packages/ui/src/sidebar.tsx` | STANDARDIZE and move to `packages/layouts`. |

---

## 6. Recommended Architecture (The Ideal System)

To achieve a scalable, multi-product platform (Control Plane, POS, Finance, PMS), Stockix must adopt the following architecture:

1. **One Single Design System**: `packages/ui` acts as the definitive component library. Strict enforcement via CI/CD to prevent localized component libraries (e.g., blocking `.tsx` files in app `components/ui/` folders).
2. **Global Theme Package**: `packages/theme` will hold `tailwind.config.ts` presets. This enables multi-tenant branding by mapping CSS variables to specific tenant themes.
3. **Meta-Driven UI Foundation**: 
   - Move away from hardcoded forms and tables.
   - Implement JSON-schema driven Form generation and Data Grid generation. This ensures that a new module in Finance or PMS can be spun up simply by defining a metadata schema, rather than writing boilerplate React code.
4. **CSS Standardization**: Ban `styled-components` and `@emotion`. Enforce Tailwind CSS strictly across the entire monorepo to ensure bundle sizes remain small and the design language remains consistent.

---

## 7. Prioritized Refactor Plan

### 🔴 P0 (Critical Inconsistencies & Duplication)
- **Consolidate POS UI**: Delete `services/posnew/packages/ui` and `services/posnew/apps/pos-frontend2/src/components/ui`. Re-wire POS imports to use the global `@repo/ui` package from `packages/ui`.
- **Extract Global Theme**: Create `packages/theme`, extract the Tailwind configurations from Dashboard and POS, and create a single shared preset.

### 🟡 P1 (Important Cleanup & Consolidation)
- **Unify Layouts**: Extract the Sidebar, Navbar, and App Shell from `apps/dashboard` into a shared `packages/layouts` (or within `packages/ui`).
- **Standardize Dependencies**: Unify React, Next.js, and Tailwind versions across all `package.json` files using the root `pnpm-workspace.yaml`.

### 🟢 P2 (Strategic Debt / Nice to Have)
- **Finance UI Overhaul**: Begin the massive effort of decoupling `services/stockix-finance` from `BlueprintJS` and `styled-components`. Rewrite the Finance UI using the `packages/ui` Shadcn primitives.
- **Chatlive Alignment**: Update `services/chatlive` Rails views to consume the unified Tailwind CSS theme tokens from `packages/theme` to ensure visual consistency with the React apps.

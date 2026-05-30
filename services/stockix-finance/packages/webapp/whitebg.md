# White Background Bug Audit

## Summary

The stockix-finance webapp uses a **two-layer dark theme**: (1) the `bp4-dark` class on `<html>`/`<body>`, and (2) CSS custom properties in `_variables.scss` where **dark values are gated behind `body.bp4-dark`**. When `bp4-dark` is absent from `<body>` at runtime, every dashboard token (`--color-dashboard-insider-background`, `--color-dashboard-topbar-background`, etc.) falls back to `:root` light values (`#fff`, `#fbfbfb`). Stockix also **removed** the global `body { background-color: var(--color-app-body) }` rule that Bigcapital relied on as a safety net. Together, any runtime path that strips `bp4-dark` from `<body>` produces a predominantly white UI even though `index.html` and SCSS variables look correct on paper.

## Root Cause (most likely)

**Runtime loss of `bp4-dark` on `<body>` combined with dark tokens scoped only to `body.bp4-dark`.**

Dark palette variables are defined in `_variables.scss` inside `body.bp4-dark { … }` (line 321+). Without that class on `<body>`, inherited tokens resolve to `:root` light defaults (`--color-app-body: #fff`, `--color-dashboard-insider-background: #fbfbfb`, etc.). Code paths that remove or fail to restore `bp4-dark` on `<body>`:

1. **`public/preload-theme.js`** — strips `bp4-dark` from both `<html>` and `<body>` on `/payment/*` routes (lines 10–13).
2. **`react-body-classname`** — `PaymentPortalPage` replaces the entire body class with a light payment class (no `bp4-dark`); on SPA navigation away, it restores the pre-mount class (often empty after preload stripped dark).
3. **`GlobalHotkeys.tsx`** — `Shift+H` toggles `bp4-dark` on **`document.body` only** (not `<html>`), flipping the app to light tokens instantly.
4. **Amplifying regression in `App.scss`** — Stockix removed Bigcapital’s `body { background-color: var(--color-app-body); overflow: hidden; }`, so there is no global dark fallback when tokens revert to light.

`DashboardThemeProvider` does **not** manage Blueprint dark mode; it only wraps styled-components / `@xstyled/emotion` for RTL.

---

## Evidence

### Hardcoded white backgrounds found

Patterns searched under `src/style/`: `background: #fff|white|#ffffff`, `background-color: …`, `#fbfbfb`, `#f5f5f5`, `#fafafa`.

#### A. Semantic tokens in `:root` (light defaults; overridden only when `body.bp4-dark` is active)

| File | Line | Rule | Inside `body.bp4-dark`? | Dark override? |
|------|------|------|---------------------------|----------------|
| `_variables.scss` | 65 | `--color-alert-primary-background: #fff;` | No (`:root`) | Yes — `body.bp4-dark` block sets transparent (line 380) |
| `_variables.scss` | 72 | `--color-ui-input-background: #fff;` | No | Yes — dark rgba (line 387) |
| `_variables.scss` | 78 | `--color-ui-html-select-background: #fff;` | No | Partial — still `#fff` in dark block (line 393) |
| `_variables.scss` | 84 | `--color-app-body: #fff;` | No | Yes — `var(--color-dark-gray1)` (line 401) |
| `_variables.scss` | 87 | `--color-splash-screen-background: #fff;` | No | Yes — `var(--color-dark-gray1)` (line 405) |
| `_variables.scss` | 90 | `--color-dashboard-insider-background: #fbfbfb;` | No | Yes — `var(--color-dark-gray1)` (line 408) |
| `_variables.scss` | 91 | `--color-dashboard-topbar-background: #fff;` | No | Yes — `var(--color-dark-gray1)` (line 409) |
| `_variables.scss` | 92 | `--color-dashboard-fallback-loading-background: #fbfbfb;` | No | Yes — dark (line 410) |
| `_variables.scss` | 94 | `--color-dashboard-datatable-background: #fff;` | No | Yes — dark (line 412) |
| `_variables.scss` | 134 | `--color-dashboard-card-background: #fff;` | No | Yes — dark (line 455) |
| `_variables.scss` | 154 | `--color-sidebar-overlay-background: #fff;` | No | Yes — dark (line 474) |
| `_variables.scss` | 165 | `--color-financial-report-background: #fff;` | No | Yes — dark (line 485) |
| `_variables.scss` | 176 | `--color-card-background: #fff;` | No | Yes — dark (line 497) |
| `_variables.scss` | 180–199 | Bank/card/transaction tokens `#fff` | No | Yes — dark variants in `body.bp4-dark` |
| `_variables.scss` | 221 | `--color-preferences-topbar-background: #fff;` | No | Yes — dark (line 547) |
| `_variables.scss` | 225 | `--color-preferences-content-background: #fbfbfb;` | No | Yes — dark (line 551) |
| `_variables.scss` | 236–271 | Report/tab/aside tokens `#fff` / `#f5f5f5` | No | Yes — dark block |
| `_variables.scss` | 302–306 | Drawer tokens `#fff` / `#fbfbfb` | No | Yes — dark block |
| `_variables.scss` | 393 | `--color-ui-html-select-background: #fff;` | **Inside** `body.bp4-dark` | **No** — remains white in dark mode |
| `_variables.scss` | 404 | `--color-splash-screen-background: #fff;` then overridden | Inside dark block | Duplicate line; second wins to dark-gray1 |
| `_variables.scss` | 609–622 | Aside/select tokens `#fff` inside dark block | Inside `body.bp4-dark` | **No** — copy-paste bugs; still `#fff` |

**Critical mechanism:** These `:root` values are **correct for light mode** but become the live values whenever `<body>` lacks `bp4-dark`.

#### B. Hardcoded literals in page/component SCSS (not token-driven)

| File | Line | Rule | Inside `body.bp4-dark`? | Dark override? |
|------|------|------|---------------------------|----------------|
| `App.scss` | 169 | `.bp3-drawer { background-color: #fbfbfb; }` | No | No — selector is `bp3-*` (stale); `.bp4-drawer` unaffected |
| `pages/Dashboard/Dashboard.scss` | 618 | `.navbar--omnibar { background-color: #fff; }` | No | No |
| `pages/register-organizaton.scss` | 62 | `background: #fff;` | No | No |
| `pages/Billing/BillingPage.scss` | 17, 21 | `background: #fff;` | No | No |
| `pages/HomePage/HomePage.scss` | 13, 64 | `background-color: #fff;` | No | No |
| `pages/AllocateLandedCost/List.scss` | 8 | `background-color: #fff;` | No | No |
| `pages/PaymentTransactions/List.scss` | 9 | `background-color: #fff;` | No | No |
| `pages/RefundVendorCredit/List.scss` | 8 | `background-color: #fff;` | No | No |
| `pages/JournalEntries/List.scss` | 10 | `// background-color: #fff;` (commented) | No | N/A |
| `objects/form.scss` | 6 | `background: #fff;` | No | Yes — `.bp4-dark &` block (line 39+) |
| `objects/form.scss` | 215 | `background: #fff;` | Nested under light context | Partial — sibling dark rules exist |
| `objects/form.scss` | 236 | `background-color: #fafafa;` | Nested | Partial |
| `containers/FinancialStatements/DrawerHeader.scss` | 11 | `--x-color-background: #fff;` | No | Yes — `@mixin dark-mode` (line 1+) |
| `components/PageForm.scss` | 6, 9 | `--color-page-form-*-background: #fff;` | No | Yes — `.bp4-dark &` (line 13+) |
| `components/Dialog/Dialog.scss` | 5 | `.bp4-dialog { background: #fff; }` | No | **No** |
| `components/Drawers/ViewDetail/ViewDetail.scss` | 7 | `background-color: #fff;` | No | **No** |
| `components/DataTable/DataTableEditable.scss` | 9 | `background-color: #FFF;` | No | **No** |
| `components/Postbox.scss` | 3 | `background: #FFF;` | No | **No** |

#### C. Removed global body rule (regression vs Bigcapital)

Bigcapital `App.scss` had:

```scss
body {
  background-color: var(--color-app-body);
  overflow: hidden;
}
```

**Stockix removed this entirely.** When `body.bp4-dark` is active, `--color-app-body` is `#1c2127`; when not, it is `#fff`. This rule was the global dark shell regardless of inner layout gaps.

---

### Theme class manipulation found

| File | Line | Code | Effect |
|------|------|------|--------|
| `public/preload-theme.js` | 4–7 | `if (theme === 'dark') { document.documentElement.classList.add('bp4-dark'); document.body.classList.add('bp4-dark'); }` | Ensures dark class on both nodes when `localStorage.theme` is unset or `'dark'` |
| `public/preload-theme.js` | 10–13 | `if (pathname.startsWith('/payment')) { …classList.remove('bp4-dark')… }` | **Removes dark from html + body** before React mounts on payment URLs |
| `index.html` | 2, 16 | `<html class="bp4-dark">`, `<body class="bp4-dark">` | Static dark classes at parse time |
| `src/components/Dashboard/GlobalHotkeys.tsx` | 13–20 | `body.classList.remove/add('bp4-dark')` on `Shift+H` | **Toggles dark on body only** → light `:root` tokens; html may still have `bp4-dark` |
| `src/hooks/useDarkMode.ts` | 10–11, 20–21 | Reads `bp4-dark` on html/body | Read-only observer; does not fix theme |
| `src/containers/Authentication/AuthPageShell.tsx` | 15 | `<BodyClassName className="authentication bp4-dark">` | Replaces body class while on auth; restores previous on unmount |
| `src/containers/PaymentPortal/PaymentPortalPage.tsx` | 16 | `<BodyClassName className={styles.rootBodyPage}>` | Replaces body class with payment class (**no `bp4-dark`**); restores pre-mount class on leave |
| `src/components/Dashboard/DashboardPage.tsx` | 62–65 | `document.body.classList.add/remove('page-${name}')` | Adds page-scoped classes; does not touch `bp4-dark` |
| `src/containers/Dashboard/Sidebar/hooks.tsx` | 330 | `document.body.classList.toggle('has-mini-sidebar', …)` | Sidebar layout only |
| `src/index.tsx` | 15–17 | Sets `--stockix-primary-color` on `documentElement` | **Does not affect** `bp4-dark` or `--color-app-body` |
| `src/components/App.tsx` | 50, 83 | Wraps routes in `<DashboardThemeProvider>` | No Blueprint dark/light management |
| Various form headers | — | `useTheme()` from `@emotion/react` | Emotion theme for layout direction/colors in TSX; **not** Blueprint `bp4-dark` |

**`react-body-classname` behavior:** On mount, saves current `document.body.className` and replaces it with the prop value. On unmount, restores the saved value. If preload stripped `bp4-dark` before payment portal mounted, the “saved” class is empty → dashboard after SPA navigation stays without `bp4-dark` on body.

**No matches** (excluding minified `bundle.js`) for: `localStorage.setItem('theme'`, `setTheme`, `bp4-light`, `removeClass.*bp4-dark`.

---

### DashboardThemeProvider analysis

**File:** `src/components/Dashboard/DashboardThemeProvider.tsx` (38 lines)

**What it does:**

- Imports `ThemeProvider` from `styled-components` and `@xstyled/emotion`.
- Builds a static `theme` object: `{ ...defaultTheme, bpPrefix: 'bp4' }`.
- Reads `direction` (`ltr`/`rtl`) from `useAppIntlContext()`.
- Wraps children in `StyleSheetManager` (adds `stylis-rtlcss` when RTL).
- Provides `{ dir: direction }` to styled-components and the xstyled theme to emotion.

**What it does NOT do:**

- Does not add/remove `bp4-dark` on `<html>` or `<body>`.
- Does not read `localStorage.theme` or system color scheme.
- Does not set `--color-app-body` or any `_variables.scss` tokens.
- Does not wrap Blueprint’s `Classes.DARK` context.

**Conclusion:** This provider is unrelated to the white-background bug except that it shares the name “ThemeProvider.”

---

### Blueprint override analysis

**Import order in `App.scss`:**

1. `./normalize` → `./_base.scss` → **`_variables.scss`** (defines `:root` + `body.bp4-dark` tokens)
2. `@blueprintjs/core/src/blueprint.scss`
3. `@blueprintjs/datetime/...`, `@blueprintjs/popover2/...`
4. `basscss/css/basscss.css` (**Stockix-only addition**)
5. App objects/components/pages

**Findings from `@blueprintjs/core` (v3.50.2 in `node_modules`):**

- `blueprint.scss` aggregates component SCSS; it does **not** set a global `body { background-color: … }` override.
- Blueprint `_variables.scss` defines `$pt-dark-app-background-color` etc. for **component** dark styling when `.bp4-dark` is an ancestor; it does not replace `--color-app-body`.
- Blueprint dark mode expects `.bp4-dark` on a root element; it styles **components** (buttons, inputs), not the Stockix dashboard shell tokens.

**basscss:** Utility classes only; no `body { background: white }` rule found in `basscss.css`.

**Stale `bp3-*` selectors in Stockix `App.scss`:** Many overrides target `.bp3-drawer`, `.bp3-dialog`, etc., while the app uses Blueprint 4 (`$ns: bp4`). The hardcoded `.bp3-drawer { background-color: #fbfbfb }` does **not** apply to live `.bp4-drawer` elements — drawer backgrounds come from tokens / Blueprint defaults instead.

**`!important` on backgrounds:** No matches under `src/style/` for `background` + `!important`.

**Specificity notes:**

- `body.authentication` in `Auth.scss` sets `background: var(--color-dark-gray1, #1c2127)` — dark auth shell (works when auth route active).
- `.dashboard__insider` uses `background-color: var(--color-dashboard-insider-background)` — **depends on `body.bp4-dark` token scope**.
- No `#root` or `.App` background rules; `.App { min-width: 960px }` only (Bigcapital also had `min-height: 100vh` removed).

---

### Components directory audit (`src/style/components/`)

37 SCSS/module files. Files with hardcoded white/light backgrounds **without** a local `.bp4-dark` override:

| File | Issue |
|------|--------|
| `Dialog/Dialog.scss` | `.bp4-dialog { background: #fff }` always |
| `Drawers/ViewDetail/ViewDetail.scss` | `background-color: #fff` |
| `DataTable/DataTableEditable.scss` | `background-color: #FFF` |
| `Postbox.scss` | `background: #FFF` |

Files with light defaults **with** dark overrides: `PageForm.scss`, `DataTable/DataTable.scss` (uses `body.bp4-dark &`), `Drawers/CashflowTransactionDrawer.scss`, `CloudSpinner.scss`, `BigAmount.module.scss`, etc.

Remaining component files use CSS variables or transparent backgrounds and inherit dashboard tokens.

---

### Key file contents (Step 3)

#### 1. `src/components/Dashboard/DashboardThemeProvider.tsx`

```tsx
import React from 'react';
import {
  ThemeProvider as StyleComponentsThemeProvider,
  StyleSheetManager,
} from 'styled-components';
import rtlcss from 'stylis-rtlcss';
import {
  defaultTheme,
  ThemeProvider as XStyledEmotionThemeProvider,
} from '@xstyled/emotion';
import { useAppIntlContext } from '../AppIntlProvider';

const theme = {
  ...defaultTheme,
  bpPrefix: 'bp4',
};

interface DashboardThemeProviderProps {
  children: React.ReactNode;
}

export function DashboardThemeProvider({
  children,
}: DashboardThemeProviderProps) {
  const { direction } = useAppIntlContext();

  return (
    <StyleSheetManager
      {...(direction === 'rtl' ? { stylisPlugins: [rtlcss] } : {})}
    >
      <StyleComponentsThemeProvider theme={{ dir: direction }}>
        <XStyledEmotionThemeProvider theme={theme}>
          {children}
        </XStyledEmotionThemeProvider>
      </StyleComponentsThemeProvider>
    </StyleSheetManager>
  );
}
```

#### 2. `src/components/App.tsx`

- Imports `@/style/App.scss`.
- Wraps all routes in `<DashboardThemeProvider>` inside `<div className="App">`.
- **No** `body`/`documentElement` class manipulation.
- Routes: auth, payment portal, dashboard (`/` → `DashboardPrivatePages`).
- Full file: 110 lines (see repo).

#### 3. `src/index.tsx`

- Mounts React to `#root`.
- Optional `REACT_APP_STOCKIX_PRIMARY_COLOR` → sets `--stockix-primary-color` on `documentElement` (unused in SCSS today).
- **No** theme initialization.
- Full file: 35 lines (see repo).

#### 4. `public/preload-theme.js`

```javascript
// Stockix default theme is dark (see index.html). Override via localStorage theme=light.
const theme = localStorage.getItem('theme') || 'dark';

if (theme === 'dark') {
  document.documentElement.classList.add('bp4-dark');
  document.body.classList.add('bp4-dark');
}

// Remove dark mode for payment portal pages
if (window.location.pathname.startsWith('/payment')) {
  document.documentElement.classList.remove('bp4-dark');
  document.body.classList.remove('bp4-dark');
}
```

**Gap:** When `localStorage.theme === 'light'`, script does not **remove** classes already present on `<html>`/`<body>` from `index.html`.

#### 5. `index.html`

```html
<!doctype html>
<html dir="ltr" lang="en" class="bp4-dark">
  <head>…<script type="module" src="/public/preload-theme.js"></script>…</head>
  <body class="bp4-dark">
    <div id="root"></div>
    …
  </body>
</html>
```

#### 6. Other `*Theme*` files under `src/`

Only branding SVGs in `src/static/icons/brands/` (`themeisle.svg`, `themeco.svg`, `affiliatetheme.svg`) — unrelated to app theme.

---

### Diff vs original Bigcapital

Compared against `https://github.com/bigcapitalhq/bigcapital` (`packages/webapp`), cloned to `C:\tmp\bigcapital-original`.

#### `_variables.scss diff

```
(no differences — files are identical)
```

#### App.scss diff

```diff
diff --git a/.../App.scss b/.../App.scss
@@ -1,15 +1,13 @@
-@import './normalize.scss';
+@import './normalize';
+
 @import './_base.scss';
 
+// Blueprint framework.
 @import '@blueprintjs/core/src/blueprint.scss';
 @import '@blueprintjs/datetime/src/blueprint-datetime.scss';
 @import '@blueprintjs/popover2/src/blueprint-popover2.scss';
 
-@mixin dark-mode {
-  .bp4-dark & {
-    @content;
-  }
-}
+@import 'basscss/css/basscss.css';
 
@@ -41,92 +39,70 @@
-@import "section";
 
-body {
-  background-color: var(--color-app-body);
-  overflow: hidden;
-}
-// App
 .App {
-  min-width: 1100px;
-  min-height: 100vh;
+  min-width: 960px;
 }
 
-(.bp4-* utility overrides renamed to .bp3-* throughout — stale vs live bp4 components)
+(.bp4-* → .bp3-* renames throughout — see full diff in repo)
 
-.bp4-drawer {
+.bp3-drawer {
   border-left: 1px solid var(--color-drawer-border-left);
+  /* Stockix: hardcoded #00115e instead of token */
 }
-
-:root {
-  --top-offset: 60px;
-}
```

**Most impactful removals:** `body { background-color: var(--color-app-body) }`, `@import "section"`, `.App min-height: 100vh`.

#### index.html diff

```diff
-<html dir="ltr" lang="en">
+<html dir="ltr" lang="en" class="bp4-dark">
 …
-    content="Bigcapital Financial Managment Software"
+    content="Stockix Financial Management"
 …
-    <title>Bigcapital</title>
+    <title>Stockix Finance</title>
   </head>
   <body class="bp4-dark">
```

Both repos keep `body class="bp4-dark"`. Stockix adds `class="bp4-dark"` on `<html>` as well.

#### DashboardThemeProvider.tsx diff

```
(no differences — files are identical)
```

#### index.tsx diff

```diff
-import { store, persistor } from '@/store/create-store';
+import { store, persistor } from '@/store/createStore';
+
+const stockixPrimary = process.env.REACT_APP_STOCKIX_PRIMARY_COLOR?.trim();
+if (stockixPrimary) {
+  document.documentElement.style.setProperty('--stockix-primary-color', stockixPrimary);
+}
```

#### App.tsx diff

```diff
+import SuspendedOverlay from '@/components/License/SuspendedOverlay';
+import { setAppQueryClient } from '@/services/queryClientHolder';
+const ChangePasswordPage = lazy(…);
+…
+              <Route path={'/auth/change-password'} children={<ChangePasswordPage />} />
+…
+        <SuspendedOverlay />
+…
+  setAppQueryClient(queryClient);
```

No theme-related changes.

#### preload-theme.js diff

```diff
-const theme =
-  localStorage.getItem('theme') ||
-  (window.matchMedia('(prefers-color-scheme: dark)').matches
-    ? 'dark'
-    : 'light');
+// Stockix default theme is dark (see index.html). Override via localStorage theme=light.
+const theme = localStorage.getItem('theme') || 'dark';
```

Stockix always defaults to `'dark'` when `localStorage.theme` is unset; Bigcapital followed OS preference. Payment-portal strip logic is **unchanged** between forks.

---

## Fix

Apply in priority order:

### 1. Restore global body background (regression fix)

**File:** `src/style/App.scss`

```scss
body {
  background-color: var(--color-app-body);
  overflow: hidden;
}
```

Place after imports / before `.App { … }` (match Bigcapital position).

### 2. Keep `bp4-dark` synchronized on `<html>` and `<body>`

**File:** `src/components/Dashboard/GlobalHotkeys.tsx`

Replace body-only toggle with both elements:

```javascript
const root = document.documentElement;
const body = document.body;
const isDark = body.classList.contains('bp4-dark');
root.classList.toggle('bp4-dark', !isDark);
body.classList.toggle('bp4-dark', !isDark);
localStorage.setItem('theme', isDark ? 'light' : 'dark');
```

### 3. Harden `preload-theme.js`

```javascript
const theme = localStorage.getItem('theme') || 'dark';
const root = document.documentElement;
const body = document.body;
const wantDark = theme === 'dark' && !window.location.pathname.startsWith('/payment');

root.classList.toggle('bp4-dark', wantDark);
body.classList.toggle('bp4-dark', wantDark);
```

Remove the separate payment strip block (handled by `wantDark`) **or** re-apply dark when navigating away from payment in a small route listener in `index.tsx` / `App.tsx`.

### 4. Fix payment portal body-class restore

**File:** `src/containers/PaymentPortal/PaymentPortalPage.tsx`

Include dark class in payment body class list when appropriate, or on unmount explicitly re-apply:

```javascript
useEffect(() => {
  return () => {
    if (localStorage.getItem('theme') !== 'light') {
      document.documentElement.classList.add('bp4-dark');
      document.body.classList.add('bp4-dark');
    }
  };
}, []);
```

### 5. (Optional structural) Move dark tokens to `:root` + `.bp4-dark` ancestor

Change `_variables.scss` from `body.bp4-dark { … }` to:

```scss
:root.bp4-dark,
.bp4-dark {
  /* dark tokens */
}
```

So dark vars activate when **either** html or any ancestor has `bp4-dark`, matching Blueprint’s model and reducing body-only fragility.

### 6. Fix always-white components

Add `.bp4-dark &` overrides or switch to variables in:

- `src/style/components/Dialog/Dialog.scss`
- `src/style/components/Drawers/ViewDetail/ViewDetail.scss`
- `src/style/components/DataTable/DataTableEditable.scss`
- `src/style/components/Postbox.scss`
- `src/style/pages/Dashboard/Dashboard.scss` (`.navbar--omnibar`)

### 7. Fix stale `bp3-*` selectors in `App.scss`

Rename `.bp3-*` back to `.bp4-*` so drawer/dialog overrides actually apply.

---

## Verification

1. **Cold load dashboard** (`/` after login): DevTools → Elements → confirm `<body class="bp4-dark …">` and computed `background-color` on `body` / `.dashboard__insider` is `rgb(28, 33, 39)` (`#1c2127`), not white.

2. **CSS variable check** (console):
   ```javascript
   getComputedStyle(document.body).getPropertyValue('--color-dashboard-insider-background')
   ```
   Expect `#1c2127` or `28, 33, 39` — not `#fbfbfb`.

3. **Payment portal SPA navigation:** Open `/payment/:linkId`, then navigate to `/` without full reload → body must regain `bp4-dark`; background stays dark.

4. **Shift+H toggle:** Toggle twice; both `<html>` and `<body>` should stay in sync; `localStorage.theme` updates.

5. **Auth flow:** Login at `/auth`, land on dashboard → `bp4-dark` present on body.

6. **Regression:** Run `pnpm dev:webapp` (or tenant docker webapp), visual spot-check topbar, sidebar, datatable, drawer — no large white fields behind content.

---

*Audit date: 2026-05-30. Scope: `services/stockix-finance/packages/webapp/`.*

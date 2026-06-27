# RBAC Integration & Regression Test Suite Report

## Test Summary
- **Total Tests:** 7
- **Passed:** 6
- **Failed:** 1

### Results List
- [PASS] API: Role CRUD operations (Iter 1) 
- [PASS] API: Owner role assignment (Iter 1) 
- [PASS] API: Role CRUD operations (Iter 2) 
- [PASS] API: Owner role assignment (Iter 2) 
- [PASS] API: Role CRUD operations (Iter 3) 
- [PASS] API: Owner role assignment (Iter 3) 
- [FAIL] UI: Playwright Integration Tests (UI tests failed: Command failed with exit code 1: pnpm --filter dashboard 'test:e2e' rbac

services/stockix-finance                 | \u2009WARN\u2009 The field "pnpm.overrides" was found in /home/jad/dev/stokcix/stockixnew/services/stockix-finance/package.json. This will not take effect. You should configure "pnpm.overrides" at the root of the workspace instead.

> dashboard@0.1.0 test:e2e /home/jad/dev/stokcix/stockixnew/apps/dashboard
> playwright test rbac


Running 1 test using 1 worker

  ✘  1 [Desktop Chrome] › e2e/rbac.spec.ts:15:7 › RBAC UI Integration › Platform roles page rendering, create, and edit (3ms)
  ✘  2 [Desktop Chrome] › e2e/rbac.spec.ts:15:7 › RBAC UI Integration › Platform roles page rendering, create, and edit (retry #1) (3ms)
  ✘  3 [Desktop Chrome] › e2e/rbac.spec.ts:15:7 › RBAC UI Integration › Platform roles page rendering, create, and edit (retry #2) (4ms)


  1) [Desktop Chrome] › e2e/rbac.spec.ts:15:7 › RBAC UI Integration › Platform roles page rendering, create, and edit 

    Error: browserType.launch: Executable doesn't exist at /home/jad/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     pnpm exec playwright install                           ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: browserType.launch: Executable doesn't exist at /home/jad/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     pnpm exec playwright install                           ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry1/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry1/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry1/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

    Retry #2 ───────────────────────────────────────────────────────────────────────────────────────

    Error: browserType.launch: Executable doesn't exist at /home/jad/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     pnpm exec playwright install                           ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝

    Error Context: test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry2/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry2/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/rbac-RBAC-UI-Integration-P-39c73-e-rendering-create-and-edit-Desktop-Chrome-retry2/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [Desktop Chrome] › e2e/rbac.spec.ts:15:7 › RBAC UI Integration › Platform roles page rendering, create, and edit 
/home/jad/dev/stokcix/stockixnew/apps/dashboard:
\u2009ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL\u2009 dashboard@0.1.0 test:e2e: `playwright test rbac`
Exit status 1)

## API Errors
No API errors detected.

## Database Errors
No Database errors detected.

## Validation Errors
No Validation errors detected.

## Suggested Fixes
- None at this time, check specific failing tests above if any.

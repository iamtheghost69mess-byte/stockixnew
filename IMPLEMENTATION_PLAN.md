# Implementation Plan — Bigcapital SaaS Gaps

Work task by task in order. Do NOT skip tasks. Each task must be fully complete before moving to the next.

See full plan in agent context / `accountmissing2.md` audit.

**Codebase root:** `services/stockix-finance/`

## RULES FOR CURSOR
- Read the full audit file `accountmissing2.md` before starting any task
- Read every file mentioned before editing it
- Never delete existing functionality — only extend or fix
- After each task, confirm what was changed and what files were modified
- If a migration is created, it must be backward compatible
- All new endpoints must be tested with a curl example in comments
- TypeScript strict mode — no `any` types
- All new services must follow existing patterns (InversifyJS DI, existing base classes)

## TASK STATUS

| Task | Description | Status |
|------|-------------|--------|
| 1 | Signup lockdown | Done |
| 2 | Setup wizard completion in DB | Done |
| 3 | Extend setup wizard fields | Done |
| 4 | License sync Stockix → Finance | Done |
| 5 | Platform user management API | Done |
| 6 | Organization number | Done |
| 7 | GET /organization/all + org switcher | Done |
| 8 | Sub-org COA/tax inheritance | Done |
| 9 | Read-only mode on license expiry | Done |
| 10 | Remove LemonSqueezy | Done |

# Environment Variable Guide

## Single Source of Truth
`/.env.example` is the canonical schema. It documents every variable
used across all services. It is the ONLY .env.example in the repo.

## For Local Development
Copy `/.env.example` to `/.env.local` and fill in real values.
Never commit `.env.local`.

## How Config Works
`packages/config` is the ONLY code that reads `process.env`.
All apps and services import config from `@repo/config`.

## Exempt Files (build/test tooling only)
The following files use dotenv directly and are formally exempt:
- `services/stockix-finance/playwright.config.ts`
- `services/stockix-finance/packages/webapp/craco.config.js`
These are test/build configs, not runtime application code.

## Adding a New Variable
1. Add it to `/.env.example` with a comment
2. Add it to `packages/config/src/index.ts` with validation
3. Export it from the typed config object
4. Never access it via process.env directly in app code

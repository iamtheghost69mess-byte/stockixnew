## Summary

<!-- What changed and why? Link issues with "Fixes #123" or "Relates to #123". -->

Fixes #

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor / chore
- [ ] Documentation
- [ ] Infrastructure / CI

## Area

- [ ] Control plane (`apps/api`, `apps/dashboard`)
- [ ] Platform packages (`packages/*`)
- [ ] Worker / provisioning (`infra/worker-service`)
- [ ] PMS (`services/pms`)
- [ ] POS (`services/posnew`)
- [ ] Finance (`services/stockix-finance`)
- [ ] Production infra (`infra/prod`, `.github`)

## Test plan

<!-- Commands run locally and what you verified manually. -->

- [ ] `pnpm --filter api test`
- [ ] `pnpm lint:boundaries && pnpm architecture:validate`
- [ ] Other:

## Security / tenancy checklist

- [ ] No secrets, `.env` files, or credentials committed
- [ ] Tenant-scoped routes still enforce organization/tenant boundaries
- [ ] Env or provisioning changes documented in `docs/ENV_REFERENCE.md` when applicable

## Screenshots / logs

<!-- Optional: UI changes, API responses, or CI output. -->

# Layer 5 ProxySQL & DB Routing Repair

- [x] `apps/pos-backend/config/config.js` — MongoDB localhost fallback has production guard and dev-only comment
- [x] `.github/workflows/network-gate.yml` — scans `apps/pos-backend/config/` directory
- [x] `.github/workflows/network-gate.yml` — excludes `mongodb://localhost` from localhost violations
- [x] `infra/worker-service/domain/provisioner.ts` — port contract comment added to `registerMysqlUserInProxySql`
- [x] TypeScript compiles with zero errors (tsc --noEmit)

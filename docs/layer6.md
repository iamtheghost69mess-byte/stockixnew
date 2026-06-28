# Layer 6 CI Full Hardening Audit

## 1. List Every GitHub Actions Workflow File

- **`build-and-publish.yml`**: Build and Push Docker Images. Triggers on `push` to `[main]`.
- **`ci.yml`**: Lint, Test, and Typecheck. Triggers on `pull_request` to `[main, develop, staging]`.
- **`config-gate.yml`**: Layer 3 Config Gate. Triggers on `push` to `['**']` and `pull_request` to `['**']`.
- **`deploy-preview-cleanup.yml`**: Tear down PR preview. Triggers on `pull_request` types `[closed]` on `[main]`.
- **`deploy-preview.yml`**: Deploy PR preview. Triggers on `pull_request` types `[opened, synchronize, reopened]` on `[main]`.
- **`deploy-production.yml`**: Deploy to production. Triggers on `workflow_dispatch`.
- **`deploy-staging.yml`**: Deploy to staging. Triggers on `workflow_run` of `Build and Publish Images` on `[main]`.
- **`image-gate.yml`**: Layer 2 Image Lock Gate. Triggers on `push` to `['**']` and `pull_request` to `['**']`.
- **`network-gate.yml`**: Layer 1 Network Architecture Gate. Triggers on `pull_request` paths `['infra/**/*', 'apps/api/src/**/*', 'packages/shared/src/tenant-dns.ts']`.
- **`publish.yml`**: Create Release Pull Request or Publish (Changesets). Triggers on `push` to `[main]`.
- **`secret-scan.yml`**: Gitleaks Secret Scan. Triggers on `push` to `[main]`, `pull_request`, `schedule`, and `workflow_dispatch`.

---

## 2. Audit Each Gate Workflow Created in Layers 1-5

### `.github/workflows/network-gate.yml` (Layer 1)
- **Runs on ALL branches?** No, only runs on `pull_request`.
- **Runs on pull_request events?** Yes, but ONLY if files in `infra/**/*`, `apps/api/src/**/*`, or `packages/shared/src/tenant-dns.ts` are modified.
- **Runs on push events?** No.
- **`if:` conditions skipping it?** No explicit `if:` conditions inside jobs, but the path filter limits its execution.
- **Uses `|| true` in grep?** Yes, it uses `FOUND=$(grep ... || true)` correctly to avoid premature bash exits.
- **Exits 1 on violations?** Yes, checks if `$FOUND` is non-empty and calls `exit 1`.
- **Could silently pass?** YES. Because the trigger is path-restricted, adding a localhost violation in `apps/pos-backend/config/config.js` will not even trigger the workflow, causing a silent pass.

### `.github/workflows/image-gate.yml` (Layer 2)
- **Runs on ALL branches?** Yes (`**`).
- **Runs on pull_request events?** Yes.
- **Runs on push events?** Yes.
- **`if:` conditions skipping it?** None.
- **Uses `|| true` in grep?** Yes.
- **Exits 1 on violations?** Yes.
- **Could silently pass?** No obvious silent passes. It searches `.` recursively for all Dockerfiles.

### `.github/workflows/config-gate.yml` (Layer 3)
- **Runs on ALL branches?** Yes (`**`).
- **Runs on pull_request events?** Yes.
- **Runs on push events?** Yes.
- **`if:` conditions skipping it?** None.
- **Uses `|| true` in grep?** Yes, in the localhost queue check.
- **Exits 1 on violations?** Yes.
- **Could silently pass?** It checks `head -5 <file> | grep -q "env"`. This only confirms "env" appears in the top 5 lines, but does not rigidly guarantee it is the *first* import line executed.

---

## 3. Check Branch Protection Rules

NOT CONFIGURED IN CODE. 
There is a `.github/CODEOWNERS` file requiring reviews from `@iamtheghost69mess-byte`, but no branch protection enforcing gates or blocking merges natively inside the codebase itself.

---

## 4. Audit the Main Build and Deploy Workflow

**Main CI: `build-and-publish.yml`**
- **Jobs**: `build-images`
- **Depends on gates?** No. It does not declare `needs:` for `network-gate`, `image-gate`, or `config-gate`.
- **Blocks deploy on gate failure?** No. `build-and-publish.yml` runs blindly on `push` to `main`. If a gate fails on a PR, but is merged anyway, the build pipeline proceeds.
- **Lint or typecheck step?** No.
- **Test step?** No.
- **What happens if tests fail?** Tests run in `ci.yml` (which triggers on `pull_request`). `build-and-publish.yml` runs independently on `push`. A test failure does not block the deployment pipeline because they are completely disjoint workflows.

---

## 5. Find Any Workflow That Could Deploy Despite Gate Failures

- **`build-and-publish.yml`**: Has no `needs:` dependencies on any gates. It runs unconditionally on `push: main`.
- **`deploy-staging.yml`**: Uses `workflow_run` on `Build and Publish Images`. Since the build job doesn't wait for gates, staging is deployed regardless of gate failures.
- **`publish.yml`**: Runs on `push: main` without waiting for gates.
- **`network-gate.yml`**: Flawed `paths:` filter means it won't even execute for changes in `apps/pos-backend`, skipping the gate entirely.

---

## 6. Check for Duplicate or Conflicting Gate Logic

- **Does the localhost scan cover `apps/pos-backend/config/`?**
  Yes, the grep command inside `network-gate.yml` includes it. However, the workflow's `on: pull_request: paths:` block lacks `apps/pos-backend/**/*`, so it won't trigger if only `config.js` is modified.
- **Does the image gate cover ALL Dockerfiles including `services/chatlive/`?**
  Yes. It runs a recursive search (`grep -rn ... .`) covering all Dockerfiles across the monorepo.
- **Does the config gate verify boot validators are truly first imports?**
  No, it just uses `head -5 ... | grep -q "env"`. It could be the 5th line after other imports.
- **Are test files excluded from the localhost scan?**
  Yes, `network-gate.yml` excludes `*.test.ts` and `*.spec.ts`.

---

## 7. Find Any Missing Gates

- [x] No docker compose up in worker code (enforced by `network-gate.yml`)
- [x] No unapproved node versions in Dockerfiles (enforced by `image-gate.yml`)
- [x] Boot validators exist and are first imports (checked loosely by `config-gate.yml`)
- [x] No localhost in container runtime code (enforced by `network-gate.yml`)
- [ ] **No host-bound ports in prod compose**: MISSING. No check exists to grep `infra/prod/docker-compose.yml` for exposed host ports like `- "3000:3000"`.
- [ ] **No Swarm deploy attributes in dev compose**: MISSING. No check exists to grep `infra/dev/docker-compose.yml` for `deploy:` or `replicas:`.
- [ ] **ProxySQL port contract not violated**: MISSING. No check exists to prevent tenant configs from using port `6032` incorrectly or the worker from using `6033` for admin queries.
- [ ] **TypeScript compiles without errors across all services**: Handled by `ci.yml` on PR, but it isn't an explicit gate blocking `build-and-publish.yml` on `push`.

---

## 8. Summary Table

| Gate | Workflow File | Triggers On | Blocks Deploy | Status |
|---|---|---|---|---|
| Network Architecture | `network-gate.yml` | `pull_request` (limited paths) | No | PARTIAL |
| Image Lock | `image-gate.yml` | `push`, `pull_request` (`**`) | No | PARTIAL |
| Config Boot Validation | `config-gate.yml` | `push`, `pull_request` (`**`) | No | PARTIAL |
| TypeScript compilation | `ci.yml` | `pull_request` | No | PARTIAL |
| Secret Scan | `secret-scan.yml` | `push`, `pull_request` | No | PARTIAL |
| Host-bound Ports in Prod | N/A | N/A | No | MISSING |
| Swarm deploy in dev compose | N/A | N/A | No | MISSING |
| ProxySQL Port Contract | N/A | N/A | No | MISSING |

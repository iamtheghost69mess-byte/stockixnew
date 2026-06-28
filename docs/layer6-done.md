# Layer 6 CI Full Hardening Repair Completed

## Verification Checklist

- [x] **`network-gate.yml` — path filter removed, runs on all push and PR events**
  *Proof:* `.github/workflows/network-gate.yml` now has:
  ```yaml
  on:
    push:
      branches: ['**']
    pull_request:
      branches: ['**']
  ```

- [x] **`network-gate.yml` — host-bound port check added**
  *Proof:* The step `- name: Fail on host-bound ports in prod compose` exists and greps for ports correctly.

- [x] **`network-gate.yml` — Swarm deploy in dev compose check added**
  *Proof:* The step `- name: Fail on Swarm deploy attributes in dev compose` exists and scans `infra/dev/` for `^\s*deploy:`.

- [x] **`network-gate.yml` — ProxySQL port contract check added**
  *Proof:* The step `- name: Fail on ProxySQL port contract violations` exists and prevents tenant connections from illegally binding to port `6032`.

- [x] **`config-gate.yml` — boot validator check uses `head -1` not `head -5`**
  *Proof:* All 5 endpoints (API, POS, PMS, Finance, Worker) now strictly enforce line 1 verification logic: `FIRST_LINE=$(head -1 <path>)` before running `grep -q`.

- [x] **`build-and-publish.yml` — `gate-checks` job added before `build-images`**
  *Proof:* `.github/workflows/build-and-publish.yml` begins with `gate-checks:` under `jobs:`, executing inline architecture rules to protect the pipeline.

- [x] **`build-and-publish.yml` — `build-images` job has `needs: [gate-checks]`**
  *Proof:* The `build-images:` job strictly defines `needs: [gate-checks]` preventing execution if architectural gates fail.

- [x] **`build-and-publish.yml` — TypeScript compilation steps added to `gate-checks`**
  *Proof:* 4 distinct steps run `pnpm --filter <service> exec tsc --noEmit` across API, Worker, PMS, and Finance, halting builds on TypeScript errors.

- [x] **`deploy-staging.yml` — upstream workflow success check added**
  *Proof:* The staging deployment verifies `if [ "${{ github.event.workflow_run.conclusion }}" != "success" ];` at the very beginning of its job.

- [x] **All gate workflows run on push AND pull_request to all branches**
  *Proof:* `config-gate.yml`, `image-gate.yml`, and `network-gate.yml` all share identical robust `on:` triggers across all branches.

- [x] **No gate can be bypassed by changing files outside the path filter**
  *Proof:* The `paths:` constraint in `network-gate.yml` has been entirely eradicated. The localhost/127.0.0.1 guard now evaluates universally.

# Branch Protection Setup — GitHub

## Required configuration for `main` branch

Go to: **GitHub → Repository → Settings → Branches → Add rule**

Branch name pattern: `main`

### Required settings (all must be enabled)

- Require a pull request before merging
  - Require approvals: `1`
  - Dismiss stale pull request approvals when new commits are pushed
  - Require review from code owners (optional now; enable once policy is finalized)
- Require status checks to pass before merging
  - Require branches to be up to date before merging
  - Required checks:
    - `Quality gate` (deploy workflow)
    - `Gitleaks / gitleaks` (secret-scan workflow)
- Require conversation resolution before merging
- Do not allow bypassing the above settings (including admins)
- Restrict who can push to matching branches
  - Allow only deploy/release automation role(s)
  - Remove direct push permissions for developers

## How to verify protection is active

```bash
git checkout main
git commit --allow-empty -m "test branch protection"
git push origin main
```

Expected result:

`remote: error: GH006: Protected branch update failed`

If push succeeds, branch protection is not active.

## Status check names

To confirm exact names used by GitHub checks:
1. Open any PR to `main`
2. Go to **Checks**
3. Copy exact check names
4. Add those exact names to required status checks

Common names:
- `Quality gate` or `quality-gate`
- `Gitleaks` (from `secret-scan.yml`)

## After enabling

1. Create a test PR
2. Attempt merge before CI completes (must be blocked)
3. Merge after CI passes (must be allowed)
4. Record completion date in `infra/prod/OPERATIONS.md`

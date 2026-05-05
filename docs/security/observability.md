# Security Observability Baseline

## Required Event Families

- `auth.login_success`
- `auth.login_failed`
- `auth.mfa_failed`
- `owner.role_changed`
- `owner.delete`
- `tenant.delete`
- `tenant.suspend`
- `tenant.reactivate`

## Operational Dashboards

1. Authentication Health
   - Failed logins by minute
   - Lockouts by minute
   - MFA failures by minute
2. Privileged Operations
   - Owner role changes
   - Owner deletions
   - Tenant lifecycle actions (delete/suspend/reactivate)
3. RBAC Enforcement
   - Forbidden actor responses
   - Forbidden role responses
   - Re-authentication failures

## Alerting Rules

- Failed login rate spike: `> 20 failures / 5min` per IP or account.
- Account lockout anomaly: `> 5 lockouts / 10min`.
- Privileged action burst: `> 10 owner/tenant destructive actions / 10min`.
- Last-super-admin guard trigger: alert on every `last_super_admin` response.

## Response Targets

- P1 auth outage: acknowledge in 5 min.
- P2 auth anomaly: acknowledge in 15 min.
- P3 isolated lockout/user issue: acknowledge in 60 min.

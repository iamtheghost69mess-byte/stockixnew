# Security Incident Response Runbook

## 1. Triage

1. Confirm signal source (dashboard, logs, alert pipeline).
2. Classify severity:
   - P1: authentication unavailable or widespread compromise
   - P2: sustained brute-force or privilege misuse
   - P3: isolated account anomaly
3. Assign incident commander and comms owner.

## 2. Containment

- For account compromise:
  - Suspend owner account (`owners.status = suspended`)
  - Rotate owner credentials
  - Increment `session_version` to invalidate sessions
- For secret exposure:
  - Rotate `SESSION_SECRET`
  - Rotate `PLATFORM_API_SECRET`
  - Restart dashboard/api with new secret values

## 3. Recovery

1. Restore owner access with MFA re-enrollment if required.
2. Verify login, MFA, and RBAC gates are functional.
3. Validate no stale privileged sessions remain.

## 4. Post-Incident

- Document timeline, root cause, and affected resources.
- Add or tune alerts that would have detected earlier.
- Record preventive code/config action items and owners.

## Break-Glass Guidance

- Keep one emergency super admin credential sealed in secure vault.
- Use break-glass account only during P1 incidents.
- Immediately rotate break-glass credentials after use.
